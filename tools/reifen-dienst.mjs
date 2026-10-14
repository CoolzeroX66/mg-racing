// Reifen-Dienst: kleiner lokaler Server, ueber den die App den Reifen-Katalog aktualisiert und den Bestand
// beim Haendler abfragt. Der Browser darf rc-kleinkram.de nicht direkt abrufen, dieser Dienst schon.
// Start: Doppelklick auf reifen-dienst-starten.cmd (oder: node tools/reifen-dienst.mjs)
import { createServer } from 'node:http';
import { updateCatalog, loadStock, SHOP_HOST } from './reifenkatalog.mjs';

export const PORT = 47811;
let running = null;

function send(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
  });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, {});
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === '/status') return send(response, 200, { ok: true, updating: Boolean(running) });
    if (url.pathname === '/katalog/aktualisieren' && request.method === 'POST') {
      // Laeuft bereits eine Aktualisierung, warten alle Anfragen auf dasselbe Ergebnis
      running ||= updateCatalog(line => console.log(line)).finally(() => { running = null; });
      return send(response, 200, await running);
    }
    if (url.pathname === '/bestand') {
      const productUrl = new URL(url.searchParams.get('url') || '');
      if (productUrl.hostname !== SHOP_HOST) return send(response, 400, { error: 'Nur Produktseiten von rc-kleinkram.de sind erlaubt.' });
      return send(response, 200, await loadStock(productUrl.href));
    }
    send(response, 404, { error: 'Unbekannte Anfrage.' });
  } catch (error) {
    console.error(`Fehler: ${error.message}`);
    send(response, 502, { error: error.message });
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.log(`Der Reifen-Dienst läuft bereits (Port ${PORT}). Dieses Fenster kann geschlossen werden.`);
  else console.error(`Reifen-Dienst konnte nicht starten: ${error.message}`);
  process.exitCode = 1;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Reifen-Dienst läuft auf http://127.0.0.1:${PORT}`);
  console.log('Solange dieses Fenster offen ist, kann die App den Reifen-Katalog aktualisieren und den Bestand abfragen.');
});
