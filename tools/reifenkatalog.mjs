// Liest die Kategorie "Reifen & Felgen > 1:10 Tourenwagen > Kompletträder > Hohlkammer" von rc-kleinkram.de
// und schreibt den Reifen-Katalog der App nach tyre-catalog.js. Wird vom Reifen-Dienst (reifen-dienst.mjs) genutzt,
// laesst sich aber auch direkt aufrufen: node tools/reifenkatalog.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const SHOP_HOST = 'www.rc-kleinkram.de';
const CATEGORY_URL = `https://${SHOP_HOST}/kategorie/sortiert-nach-kategorien/reifen-felgen/1-10-tourenwagen/komplettraeder/hohlkammer/`;
const PER_PAGE = 60;
const OUTPUT = fileURLToPath(new URL('../tyre-catalog.js', import.meta.url));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const decodeEntities = text => text
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const clean = text => decodeEntities(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function load(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Mega Godzilla Racing Manager Reifenkatalog)' } });
  if (!response.ok) throw new Error(`Seite nicht erreichbar (HTTP ${response.status}): ${url}`);
  const bytes = await response.arrayBuffer();
  const charset = /charset=([\w-]+)/i.exec(response.headers.get('content-type') || '')?.[1] || 'windows-1252';
  await pause(300);
  return new TextDecoder(/utf-?8/i.test(charset) ? 'utf-8' : 'windows-1252').decode(bytes);
}

// Bestand in der Produktliste: gruenes Symbol mit "aktuell 6x lagernd", rotes Symbol = nicht lagernd
function listingStock(box) {
  const qty = /aktuell\s+(\d+)\s*x\s+lagernd/i.exec(box)?.[1];
  if (qty) return { available: true, qty: Number(qty), text: `${qty} Stück lagernd` };
  if (/red-icons/.test(box)) return { available: false, qty: 0, text: 'Nicht lagernd' };
  return { available: null, qty: null, text: 'Bestand unbekannt' };
}
// Produkte einer Listenseite: Shop-Artikelnummer, Titel, Link zur Produktseite, Bestand
function parseListing(page) {
  return page.split('class="product--box box--list"').slice(1).map(box => {
    const shopNo = /data-ordernumber="([^"]+)"/.exec(box)?.[1];
    const url = /<a href="([^"]+)"/.exec(box)?.[1];
    const title = /class="product--title" title="([^"]*)"/.exec(box)?.[1];
    return shopNo && url && title ? { shopNo, url, title: clean(title), stock: listingStock(box) } : null;
  }).filter(Boolean);
}

// Aktueller Bestand von der Produktseite ("7 Stück sofort versandfertig, Lieferzeit ca. 1 Werktag")
export async function loadStock(url) {
  const page = await load(url);
  const delivery = /<span class="delivery--text ([^"]*)"[^>]*>([\s\S]*?)<\/span>/.exec(page);
  if (!delivery) throw new Error('Bestand auf der Produktseite nicht gefunden.');
  const text = clean(delivery[2]);
  const qty = /(\d+)\s*St(?:ü|ue)ck/i.exec(text)?.[1];
  const available = /text-available/.test(delivery[1]);
  return { available, qty: qty ? Number(qty) : available ? null : 0, text, checkedAt: new Date().toISOString() };
}
async function loadListing(query = '') {
  const products = [];
  for (let page = 1; page < 20; page += 1) {
    const items = parseListing(await load(`${CATEGORY_URL}?p=${page}&n=${PER_PAGE}${query}`));
    products.push(...items);
    if (items.length < PER_PAGE) break;
  }
  return products;
}

// Hersteller kommen aus dem Hersteller-Filter des Shops, nicht aus dem Titel
function parseManufacturers(page) {
  const facet = page.slice(page.indexOf('facet--manufacturer'));
  const list = facet.slice(0, facet.indexOf('</ul>') + 5 || 20000);
  return [...list.matchAll(/name="__s__(\d+)"[\s\S]*?<label[^>]*>([\s\S]*?)<\/label>/g)].map(match => ({ id: match[1], name: clean(match[2]) }));
}

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Hersteller-Artikelnummer: steht im Titel direkt hinter dem Herstellernamen ("Corally 14752-28 - ...").
// Fehlt sie dort, wird die Shop-Nummer ohne Shop-Praefix ("72-") verwendet.
function manufacturerNumber(product, mfr) {
  const shopCode = product.shopNo.replace(/^\d+-/, '');
  const first = product.title.split(' - ')[0].replace(new RegExp(`^${escapeRegExp(mfr)}\\s*`, 'i'), '').trim();
  const code = first.split(' ').pop();
  if (!code || !/\d/.test(code)) return shopCode;
  // Variante steht nur in der Shop-Nummer (z. B. Team Saxo TS01208 -> TS01208-24X-RW)
  const index = shopCode.toUpperCase().indexOf(code.toUpperCase());
  if (index >= 0 && shopCode.length > index + code.length) return shopCode.slice(index);
  return code;
}

// Belag aus Titel, sonst aus der Produktbeschreibung: asphalt, carpet, both oder unknown
const ASPHALT = /asphalt|outdoor/i;
const CARPET = /teppich|carpet|indoor/i;
function surfaceFrom(text) {
  const asphalt = ASPHALT.test(text);
  const carpet = CARPET.test(text);
  if (asphalt && carpet) return 'both';
  return asphalt ? 'asphalt' : carpet ? 'carpet' : null;
}
async function surfaceOf(product) {
  const fromTitle = surfaceFrom(product.title);
  if (fromTitle) return fromTitle;
  const page = await load(product.url);
  const description = clean(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/.exec(page)?.[1] || '');
  if (/hybrid|allround|sowohl|indoor wie outdoor|ebenso indoor/i.test(description)) return 'both';
  return surfaceFrom(description) || 'unknown';
}

// Bezeichnung ohne Hersteller, Artikelnummer, Belag, Stueckzahl und allgemeine Kategorie-Begriffe
const NAME_REMOVALS = [
  /\(?\s*\d+\s*St(?:ü|ue|u)?c?k?[^)]*\)?/gi,
  /\bfür\s+1[:/]10\s+Tourenwagen\b/gi,
  /\b(?:Indoor|Outdoor)\s+(?:Teppich|Asphalt)(?:\s+Reifen)?\b|\b(?:Teppich|Asphalt)\s+(?:Indoor|Outdoor)\b/gi,
  /\b(?:Asphalt|Teppich)\s+Reifen\b/gi,
  /(?:\b1[:/]10\s*)?\b(?:Tourenwagen|TC)\b\s*(?:Reifen|Kompletträder|Komplettrad|Radsatz)?/gi,
  /\bKompletträder|\bKomplettrad|\bRadsatz\b/gi,
  /\bfür\s+(?:Teppich|Asphalt)\b/gi,
  /\b(?:Asphalt|Teppich|Carpet)\b/gi,
];
function modelName(product, mfr) {
  const [first, ...rest] = product.title.split(' - ');
  // erster Teil: "Hersteller [Zusatz] Artikelnummer [Modell]" -> Hersteller und Artikelnummer entfernen
  const head = first.replace(new RegExp(`^${escapeRegExp(mfr)}\\s*`, 'i'), '').replace(/^RC\s+/, '').split(' ');
  const codeIndex = head.findIndex(word => /\d/.test(word));
  if (codeIndex >= 0) head.splice(codeIndex, 1);
  const segments = [head.join(' '), ...rest].map(segment => {
    let text = segment;
    NAME_REMOVALS.forEach(pattern => { text = text.replace(pattern, ' '); });
    return text.replace(/\s+/g, ' ').replace(/^[\s\-·]+|[\s\-·]+$/g, '').trim();
  }).filter(segment => segment && !/^reifen$/i.test(segment));
  const unique = segments.filter((segment, index) => segments.findIndex(other => other.toLowerCase() === segment.toLowerCase()) === index);
  return unique.join(' · ');
}

// Liest die Kategorie komplett neu ein, schreibt tyre-catalog.js und gibt { meta, catalog } zurueck
export async function updateCatalog(log = console.log) {
  log('Lese Kategorie Hohlkammer-Kompletträder von rc-kleinkram.de …');
  const firstPage = await load(`${CATEGORY_URL}?p=1&n=${PER_PAGE}`);
  const manufacturers = parseManufacturers(firstPage);
  if (!manufacturers.length) throw new Error('Hersteller-Filter nicht gefunden – hat sich der Aufbau der Webseite geändert?');
  const all = await loadListing();
  const catalog = {};
  let count = 0;
  for (const { id, name: mfr } of manufacturers) {
    const products = await loadListing(`&s=${id}`);
    for (const product of products) {
      const articleNo = manufacturerNumber(product, mfr);
      const pieces = Number(/(\d+)\s*St(?:ü|ue|\b)/i.exec(product.title)?.[1]) || null;
      (catalog[mfr] ||= []).push({ articleNo, name: modelName(product, mfr) || articleNo, surface: await surfaceOf(product), pieces, url: product.url, stock: product.stock });
      count += 1;
    }
    log(`  ${mfr}: ${products.length}`);
  }
  if (count !== all.length) log(`Hinweis: ${all.length} Produkte in der Kategorie, aber ${count} einem Hersteller zugeordnet.`);
  Object.values(catalog).forEach(models => models.sort((a, b) => a.name.localeCompare(b.name, 'de-DE', { numeric: true })));
  const meta = { source: CATEGORY_URL, updatedAt: new Date().toISOString(), count };
  const content = `// Automatisch erzeugt von tools/reifenkatalog.mjs – nicht von Hand bearbeiten.\n`
    + `// Quelle: rc-kleinkram.de, 1:10 Tourenwagen Kompletträder Hohlkammer. surface: asphalt | carpet | both | unknown\n`
    + `// stock: Bestand beim Haendler zum Zeitpunkt updatedAt\n`
    + `const TYRE_CATALOG_META = ${JSON.stringify(meta, null, 2)};\n`
    + `const TYRE_CATALOG = ${JSON.stringify(catalog, null, 2)};\n`;
  await writeFile(OUTPUT, content, 'utf-8');
  log(`Fertig: ${count} Reifen von ${Object.keys(catalog).length} Herstellern in tyre-catalog.js gespeichert.`);
  return { meta, catalog };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  updateCatalog().catch(error => {
    console.error(`Fehler: ${error.message}`);
    process.exitCode = 1;
  });
}
