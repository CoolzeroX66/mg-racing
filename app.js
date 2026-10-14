const demoDrivers = [
  { name: 'Lukas Weber', nameNormalized: true, cls: '2WD Buggy', number: 7, status: 'Bereit' },
  { name: 'Anna Hoffmann', nameNormalized: true, cls: '2WD Buggy', number: 12, status: 'Bereit' },
  { name: 'Tobias Klein', nameNormalized: true, cls: '4WD Buggy', number: 21, status: 'Bereit' },
  { name: 'Mia Schneider', nameNormalized: true, cls: 'Short Course', number: 4, status: 'Bereit' },
  { name: 'Jan Fischer', nameNormalized: true, cls: '4WD Buggy', number: 31, status: 'Bereit' }
];
const demoRaces = [
  { time: '09:00', name: '2WD Buggy - Vorlauf 1', meta: 'Lauf 1 von 3 · 8 Fahrer', status: 'done' },
  { time: '09:45', name: '4WD Buggy - Vorlauf 1', meta: 'Lauf 1 von 3 · 6 Fahrer', status: 'live' },
  { time: '10:30', name: 'Short Course - Vorlauf 1', meta: 'Lauf 1 von 3 · 5 Fahrer', status: 'next' },
  { time: '11:15', name: '2WD Buggy - Vorlauf 2', meta: 'Lauf 2 von 3 · 8 Fahrer', status: 'next' }
];
const stored = JSON.parse(localStorage.getItem('mg-race-data') || 'null');
const testDriverNames = new Set(demoDrivers.flatMap(driver => {
  const parts = driver.name.split(' ');
  return [driver.name, `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`].map(name => name.toLocaleLowerCase('de-DE'));
}));
const emptyRaceData = () => ({ renntag: null, drivers: [], races: demoRaces, schedule: [], dashboardDrivers: [], importiert: false, imports: { vorlauf: null, finale: null, zeitplan: null }, clock: { testMode: false, testTime: '09:00' }, alarmSettings: { greaseLeadSeconds: 1200, extraEnabled: false, extraLeadSeconds: 600, extraText: 'Zusatzalarm', volume: 0.5 } });
// Reifen-Management gilt renntagsuebergreifend und bleibt beim Zuruecksetzen der Renntag-Daten erhalten
// (Reifensaetze mit Zaehlern und Einsatz-Protokoll, eigene Hersteller/Modelle, Katalog, Haendler-Bestand, Einstellungen)
const TYRE_DATA_KEYS = ['tyres', 'customTyreCatalog', 'tyreCatalog', 'tyreStock', 'tyreSettings'];
const data = stored || emptyRaceData();
data.imports = data.imports || { vorlauf: null, finale: null, zeitplan: null };
data.analysisImports = data.analysisImports || {};
data.analysisResults = data.analysisResults || {};
data.analysisSelections = data.analysisSelections || {};
// Alte Analyse-Schluessel "Klasse|vorlauf1" auf "Klasse|Gruppe|Laufart|Nr" umstellen; ohne erkannte Gruppe nicht zuordenbar
Object.keys(data.analysisResults).filter(key => /\|(?:vorlauf|finale)\d$/.test(key)).forEach(key => {
  const result = data.analysisResults[key];
  const newKey = result.group && result.group !== '-' ? analysisKey(result) : null;
  ['analysisResults', 'analysisImports', 'analysisSelections'].forEach(store => {
    if (newKey && data[store][key] !== undefined && data[store][newKey] === undefined) data[store][newKey] = data[store][key];
    delete data[store][key];
  });
});
data.weatherSettings = data.weatherSettings || { enabled: false, location: '', lat: null, lon: null, locationName: '' };
data.tyres = data.tyres || [];
data.customTyreCatalog = data.customTyreCatalog || {};
data.tyreStock = data.tyreStock || {};
data.tyreSettings = { classLimit: 2, wearRuns: 10, ...(data.tyreSettings || {}) };
data.tyreSelections = data.tyreSelections || {};
data.tyreCounted = data.tyreCounted || {};
data.myDriverId = data.myDriverId ?? null;
migrateTyreSets();
data.nameCorrections = data.nameCorrections || {};
data.nameIgnored = data.nameIgnored || [];
data.autoImport = { enabled: false, folderName: '', intervalSeconds: 30, seen: {}, log: [], ...(data.autoImport || {}) };
data.weatherCache = data.weatherCache || null;
data.schedule = data.schedule || [];
data.scheduleAdjustments = data.scheduleAdjustments || {};
data.clock = data.clock || { testMode: false, testTime: '09:00' };
data.alarmSettings = { greaseLeadSeconds: 1200, extraEnabled: false, extraLeadSeconds: 600, extraText: 'Zusatzalarm', volume: 0.5, toneMode: 'built-in', mp3Name: '', ...(data.alarmSettings || {}) };
if (data.alarmSettings.extraText === 'Reifen Schmieren 2') data.alarmSettings.extraText = 'Zusatzalarm';
data.clock.testTimeStartedAt = data.clock.testTimeStartedAt || Date.now();
data.drivers = data.drivers.filter(driver => !testDriverNames.has(driver.name.toLocaleLowerCase('de-DE')));
const save = () => localStorage.setItem('mg-race-data', JSON.stringify(data));
function currentRaceTime() {
  if (data.clock.testMode) {
    const totalSeconds = currentRaceSeconds();
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function currentRaceSeconds() {
  if (data.clock.testMode) {
    const [hours, minutes] = data.clock.testTime.split(':').map(Number);
    const baseSeconds = hours * 3600 + minutes * 60;
    return baseSeconds + Math.floor((Date.now() - data.clock.testTimeStartedAt) / 1000);
  }
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}
function formatDriverName(rawName) {
  if (rawName.includes(',')) return rawName.replace(/\s*,\s*/, ', ').replace(/\s+/g, ' ').trim();
  const parts = rawName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts.join(' ');
  return `${parts[0]}, ${parts.slice(1).join(' ')}`;
}
function migrateOldDisplayName(name) {
  const cleanName = name.split(/\s+DEU\s+/i)[0].replace(/,\s*,/g, ',').trim();
  if (cleanName.includes(',')) return cleanName;
  const parts = cleanName.split(/\s+/).filter(Boolean);
  const deuIndex = parts.indexOf('DEU');
  if (deuIndex > 0 && parts.length > deuIndex + 1) return `${parts[parts.length - 1]}, ${parts[0]}`;
  if (parts.length < 2) return name.trim();
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
}
function normalizeDrivers(drivers) {
  const unique = new Map();
  drivers.forEach(driver => {
    const name = driver.nameNormalized ? migrateOldDisplayName(driver.name) : formatDriverName(driver.name);
    const key = name.toLocaleLowerCase('de-DE');
    const existing = unique.get(key);
    if (existing) {
      existing.classes = [...new Set([...(existing.classes || [existing.cls]), driver.cls])];
      existing.groups = [...new Set([...(existing.groups || [existing.group]), driver.group])];
      existing.memberships = [...(existing.memberships || []), ...(driver.memberships || [{ cls: driver.cls, group: driver.group }])].filter((membership, index, list) => list.findIndex(item => item.cls === membership.cls && item.group === membership.group) === index);
    } else {
      const memberships = driver.memberships || [{ cls: driver.cls, group: driver.group }];
      unique.set(key, { ...driver, name, nameNormalized: true, classes: [...new Set(driver.classes || memberships.map(membership => membership.cls))], groups: [...new Set(driver.groups || memberships.map(membership => membership.group))], memberships });
    }
  });
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name, 'de-DE', { sensitivity: 'base' }));
}
// Gaengige Vornamen: steht einer davon vor dem Komma, ist der Name vermutlich als "Vorname, Nachname" erfasst
const FIRST_NAMES = new Set(('alex alexander andre andreas angelika anja anna antonius arik axel ben benjamin bernd birgit bjoern björn carsten chris christian christina christoph christopher claudia daniel david dennis dieter dirk dominik eliah elias emil eric erik fabian felix finn florian frank franz frederik friedrich georg gerd gerhard günther guenther hans harald heiko heinz helmut hendrik henrik holger ingo jakob jan jana jens joachim joel johannes jonas jonathan josef julia julian jürgen juergen kai karl katharina kay kevin klaas klaus kurt lars laura leon lena lennart lisa louis luca lukas luke lutz manfred manuel marc marcel marco marcus mario marius mark marko markus martin matteo matthias max maximilian michael michaela mike mirko moritz niklas nico nicole nils norbert oliver pascal patrick paul peter philipp pierre rafael rainer ralf ralph rene robert robin roland rolf ruediger rüdiger sabine sandra sascha sebastian simon stefan stefanie steffen stephan sven tanja thilo thomas thorsten tim timo tobias tom torsten udo ulrich uwe volker walter werner wolfgang yannick').split(' '));
const isFirstName = part => String(part).split(/[\s-]+/).some(token => FIRST_NAMES.has(token.toLocaleLowerCase('de-DE')));
const swapName = name => name.split(',').map(part => part.trim()).reverse().join(', ');
const correctedName = name => data.nameCorrections[name.toLocaleLowerCase('de-DE')] || name;
// Liefert Namen, die vermutlich als "Vorname, Nachname" importiert wurden, samt Vorschlag
function findReversedNames(names) {
  const known = new Set([...data.drivers.map(driver => driver.name), ...Object.values(data.analysisResults).flatMap(result => result.drivers.map(driver => driver.name)), ...names].map(name => name.toLocaleLowerCase('de-DE')));
  return [...new Set(names)].filter(name => {
    const parts = name.split(',').map(part => part.trim());
    if (parts.length !== 2 || data.nameIgnored.includes(name.toLocaleLowerCase('de-DE'))) return false;
    const reversedByNames = isFirstName(parts[0]) && !isFirstName(parts[1]);
    const correctByNames = isFirstName(parts[1]) && !isFirstName(parts[0]);
    return reversedByNames || (known.has(swapName(name).toLocaleLowerCase('de-DE')) && !correctByNames);
  }).map(name => ({ found: name, suggestion: swapName(name) }));
}
// Bestaetigte Korrekturen auf Fahrer und Analyse-Ergebnisse anwenden; doppelte Fahrer werden zusammengefuehrt
function applyNameCorrections() {
  const selectedNames = data.dashboardDrivers.map(id => data.drivers.find(driver => String(driver.id || driver.number) === String(id))?.name).filter(Boolean).map(correctedName);
  data.drivers = normalizeDrivers(data.drivers.map(driver => ({ ...driver, name: correctedName(driver.name) })));
  data.dashboardDrivers = [...new Set(selectedNames)].map(name => data.drivers.find(driver => driver.name === name)).filter(Boolean).map(driver => driver.id || String(driver.number)).slice(0, 3);
  Object.values(data.analysisResults).forEach(result => result.drivers.forEach(driver => { driver.name = correctedName(driver.name); }));
}
let pendingNameFixes = [];
function renderNameCheck() {
  const container = document.querySelector('#name-check');
  if (!pendingNameFixes.length) { container.innerHTML = ''; return; }
  container.innerHTML = `<div class="name-check-backdrop"><div class="name-check" role="dialog" aria-modal="true" aria-labelledby="name-check-title"><span class="warning-kicker">Hinweis</span><h2 id="name-check-title">Namen in falscher Schreibweise gefunden</h2><p>Namen werden als <strong>Nachname, Vorname</strong> gespeichert. Diese Namen sind vermutlich vertauscht. Wähle aus, welche korrigiert werden sollen.</p><div class="name-check-list">${pendingNameFixes.map((fix, index) => `<label class="name-check-row"><input type="checkbox" data-name-fix="${index}" checked><span class="name-check-found">${fix.found}</span><span class="name-check-arrow">→</span><strong>${fix.suggestion}</strong></label>`).join('')}</div><div class="name-check-actions"><button type="button" class="text-button" data-name-fix-skip>Nicht korrigieren</button><button type="button" class="primary-button" data-name-fix-apply>Auswahl korrigieren</button></div></div></div>`;
  container.querySelector('[data-name-fix-apply]').onclick = () => resolveNameCheck([...container.querySelectorAll('[data-name-fix]')].map(input => input.checked));
  container.querySelector('[data-name-fix-skip]').onclick = () => resolveNameCheck(pendingNameFixes.map(() => false));
}
function resolveNameCheck(choices) {
  let fixed = 0;
  pendingNameFixes.forEach((fix, index) => {
    const key = fix.found.toLocaleLowerCase('de-DE');
    if (choices[index]) { data.nameCorrections[key] = fix.suggestion; fixed += 1; } else if (!data.nameIgnored.includes(key)) data.nameIgnored.push(key);
  });
  pendingNameFixes = [];
  if (fixed) applyNameCorrections();
  save();
  renderNameCheck();
  render();
  toast(fixed ? `${fixed} Name${fixed === 1 ? '' : 'n'} korrigiert.` : 'Namen unverändert übernommen.');
}
function checkImportedNames(names) {
  pendingNameFixes = findReversedNames(names);
  renderNameCheck();
}
function mergeImportedDrivers(currentDrivers, importedDrivers) {
  return normalizeDrivers([...currentDrivers, ...importedDrivers]);
}
data.drivers = normalizeDrivers(data.drivers);
data.dashboardDrivers = data.dashboardDrivers.filter(id => data.drivers.some(driver => String(driver.id || driver.number) === String(id))).slice(0, 3);
save();
let view = data.renntag ? 'dashboard' : 'start';
const app = document.querySelector('#app');
function updateActiveEvent() {
  const eventName = document.querySelector('#active-event-name');
  if (eventName) eventName.textContent = data.renntag?.name || 'Kein Renntag';
}
const warningHistory = new Set();
const warningPending = new Set();
const dismissedWarnings = new Set();
let audioContext;
let alarmAudioUrl = (data.alarmSettings.toneMode === 'mp3' && data.alarmSettings.mp3DataUrl) ? data.alarmSettings.mp3DataUrl : null;
// Ein einziges Audio-Element fuer den MP3-Alarm: iOS spielt Ton nur ab, wenn das Element
// einmal bei einer Beruehrung gestartet wurde - danach darf es auch der Countdown ausloesen
const alarmAudio = new Audio();
let alarmAudioUnlocked = false;
let alarmTestActive = false;
let alarmTestTimer;
function playAlarmAudio(loop) {
  if (alarmAudio.src !== alarmAudioUrl) alarmAudio.src = alarmAudioUrl;
  alarmAudio.loop = loop;
  alarmAudio.muted = false;
  alarmAudio.volume = Math.max(0, Math.min(1, Number(data.alarmSettings.volume) || 0));
  alarmAudio.currentTime = 0;
  return alarmAudio.play();
}
function unlockAudio() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state !== 'running') audioContext.resume();
  if (!alarmAudioUnlocked && alarmAudioUrl && !alarmTestActive) {
    alarmAudio.src = alarmAudioUrl;
    alarmAudio.muted = true;
    alarmAudio.play().then(() => { alarmAudioUnlocked = true; if (!alarmTestActive) alarmAudio.pause(); }).catch(() => {});
  }
  requestWakeLock();
}
['click', 'touchend'].forEach(type => document.addEventListener(type, unlockAudio, { passive: true }));
// Bildschirm anlassen, solange die App sichtbar ist - sonst sperrt das iPad und Countdown-Alarme bleiben aus
let wakeLock = null;
async function requestWakeLock() {
  if (wakeLock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (error) { wakeLock = null; }
}
document.addEventListener('visibilitychange', requestWakeLock);
const initials = name => name.split(' ').map(part => part[0]).join('').slice(0, 2);
const toast = message => { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); };
// Browser, PDF.js und Netzwerk liefern englische Fehlertexte; fuer die Anzeige werden sie ins Deutsche uebersetzt.
const errorText = error => {
  const name = error?.name || '';
  const message = String(error?.message || error || '');
  if (/[äöüÄÖÜß]/.test(message) || /^(Kein|Keine|Ort nicht|PDF-Leser)/.test(message)) return message;
  if (name === 'InvalidPDFException' || /invalid pdf/i.test(message)) return 'Die Datei ist kein gültiges PDF.';
  if (name === 'PasswordException' || /password/i.test(message)) return 'Das PDF ist passwortgeschützt.';
  if (name === 'MissingPDFException' || /missing pdf/i.test(message)) return 'Die PDF-Datei wurde nicht gefunden.';
  if (name === 'UnexpectedResponseException' || /worker/i.test(message)) return 'Der PDF-Leser konnte nicht gestartet werden. Bitte Internetverbindung prüfen.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Zugriff nicht erlaubt.';
  if (name === 'NotFoundError') return 'Datei oder Ordner nicht gefunden (verschoben oder gelöscht?).';
  if (name === 'NotReadableError') return 'Datei konnte nicht gelesen werden (evtl. noch in Bearbeitung).';
  if (name === 'AbortError') return 'Vorgang abgebrochen.';
  if (name === 'QuotaExceededError') return 'Der lokale Speicher ist voll.';
  if (name === 'TypeError' && /fetch|network|load failed/i.test(message)) return 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.';
  if (name === 'SyntaxError' && /json/i.test(message)) return 'Ungültige Antwort vom Server.';
  return 'Unbekannter Fehler. Bitte erneut versuchen.';
};
const statusLabel = status => status === 'live' ? 'Jetzt' : status === 'done' ? 'Erledigt' : 'Geplant';
const raceRow = race => `<div class="race-row ${race.status === 'done' ? 'race-done' : ''}"><div class="race-time">${race.time}</div><div><div class="race-name">${race.name}</div><span class="race-meta">${race.meta}</span></div><span class="status ${race.status === 'live' ? 'live' : race.status === 'done' ? 'done' : ''}">${statusLabel(race.status)}</span></div>`;
const scheduleLabel = entry => `${entry.raceType} ${entry.raceNumber}`;
function scheduleKey(entry) { return entry.originalKey || `${entry.cls}|${entry.group}|${entry.raceType}|${entry.raceNumber}|${entry.start}`; }
function shiftTime(value, offsetMinutes) {
  const total = (scheduleMinutes(value) + offsetMinutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function adjustedSchedule(entry) {
  const offset = data.scheduleAdjustments[scheduleKey(entry)] || 0;
  return offset ? { ...entry, originalKey: scheduleKey(entry), start: shiftTime(entry.start, offset), end: shiftTime(entry.end, offset), adjustment: offset } : entry;
}
const isFinalGroup = group => /^Finale\s/i.test(String(group));
const isFinalRun = run => /^final/i.test(run.raceType);
const groupLabel = group => isFinalGroup(group) ? group : `Gruppe ${group}`;
function driverMemberships(driver) {
  return driver.memberships || (driver.classes || [driver.cls]).flatMap(cls => (driver.groups || [driver.group]).map(group => ({ cls, group })));
}
// Vor- und Finallaeufe des Fahrers; Finallaeufe erscheinen, sobald die Finaleinteilung importiert ist
function driverSchedule(driver) {
  const memberships = driverMemberships(driver);
  return data.schedule.filter(entry => memberships.some(membership => membership.cls === entry.cls && membership.group === entry.group)).map(adjustedSchedule).sort((left, right) => left.start.localeCompare(right.start));
}
// Hinweis, wenn alle Vorlaeufe vorbei sind, aber Finaleinteilung oder Final-Zeitplan noch fehlen
function finalPhaseHint(drivers) {
  const runs = drivers.flatMap(driverSchedule);
  if (!runs.length || runs.some(run => scheduleState(run).className !== 'finished')) return null;
  if (!drivers.every(driver => driverMemberships(driver).some(membership => isFinalGroup(membership.group)))) return { text: 'Vorläufe beendet. Importiere jetzt die Gruppeneinteilung Finale.', type: 'finale', button: 'Finaleinteilung importieren' };
  if (!runs.some(isFinalRun)) return { text: 'Die Finalgruppen sind da, aber der Zeitplan enthält noch keine Finalläufe. Importiere den aktuellen Zeitplan.', type: 'zeitplan', button: 'Zeitplan importieren' };
  return null;
}
const phaseHintMarkup = hint => hint ? `<div class="phase-hint"><span>${hint.text}</span><button type="button" class="secondary-button" data-import-type="${hint.type}">${hint.button}</button></div>` : '';
function clockMinutes() {
  return Math.floor(currentRaceSeconds() / 60);
}
function scheduleMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
function scheduleSeconds(value) {
  return scheduleMinutes(value) * 60;
}
function countdownText(minutes) {
  const seconds = Math.max(0, Math.round(minutes * 60));
  if (seconds <= 0) return 'Jetzt';
  const hours = Math.floor(seconds / 3600);
  const restMinutes = Math.floor((seconds % 3600) / 60);
  const restSeconds = seconds % 60;
  return `in ${String(hours).padStart(2, '0')}:${String(restMinutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
}
function scheduleState(run) {
  const now = currentRaceSeconds();
  const start = scheduleSeconds(run.start);
  const end = scheduleSeconds(run.end);
  if (now >= end) return { className: 'finished', label: 'Erledigt', detail: 'Lauf beendet' };
  if (now >= start) return { className: 'running', label: 'Läuft jetzt', detail: `Ende ${run.end} Uhr` };
  return { className: 'upcoming', label: countdownText((start - now) / 60), detail: `Start ${run.start} Uhr` };
}
function warningForRun(run) {
  const secondsUntilStart = scheduleSeconds(run.start) - currentRaceSeconds();
  if (secondsUntilStart > 0 && secondsUntilStart <= 300) return { type: 'technical', text: 'Technische Abnahme', className: 'technical-warning' };
  if (data.alarmSettings.extraEnabled && secondsUntilStart > 300 && secondsUntilStart <= data.alarmSettings.extraLeadSeconds) return { type: 'extra', text: data.alarmSettings.extraText || 'Zusatzalarm', className: 'extra-warning' };
  if (secondsUntilStart > 300 && secondsUntilStart <= data.alarmSettings.greaseLeadSeconds) return { type: 'tyres', text: 'Reifen schmieren/Heizen', className: 'tyre-warning' };
  return null;
}
function playWarningTone() {
  if (data.alarmSettings.toneMode === 'mp3' && alarmAudioUrl) {
    playAlarmAudio(false).catch(() => {});
    return true;
  }
  if (!audioContext) return false;
  if (audioContext.state !== 'running') { audioContext.resume(); return false; }
  const volume = Math.max(0, Math.min(1, Number(data.alarmSettings.volume) || 0));
  const start = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'square';
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.2 * volume, start + 0.04);
  gain.gain.setValueAtTime(0.2 * volume, start + 1.75);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.9);
  oscillator.frequency.setValueAtTime(480, start);
  oscillator.frequency.linearRampToValueAtTime(1250, start + 0.42);
  oscillator.frequency.linearRampToValueAtTime(480, start + 0.84);
  oscillator.frequency.linearRampToValueAtTime(1250, start + 1.26);
  oscillator.frequency.linearRampToValueAtTime(480, start + 1.68);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + 1.95);
  return true;
}
function stopAlarmTest() {
  clearInterval(alarmTestTimer);
  alarmTestTimer = undefined;
  alarmAudio.pause();
  alarmAudio.loop = false;
  alarmTestActive = false;
}
function toggleAlarmTest() {
  if (alarmTestActive) {
    stopAlarmTest();
    render();
    return;
  }
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  alarmTestActive = true;
  if (data.alarmSettings.toneMode === 'mp3' && alarmAudioUrl) {
    playAlarmAudio(true).then(() => { alarmAudioUnlocked = true; }).catch(() => { alarmTestActive = false; render(); });
  } else {
    playWarningTone();
    alarmTestTimer = setInterval(() => {
      if (alarmTestActive) playWarningTone();
    }, 2200);
  }
  render();
}
function triggerWarning(run, warning) {
  const key = `${scheduleKey(run)}|${warning.type}`;
  if (warningHistory.has(key) || warningPending.has(key)) return;
  if (data.alarmSettings.toneMode === 'mp3' && alarmAudioUrl) {
    if (playWarningTone()) warningHistory.add(key);
    return;
  }
  if (!audioContext) return;
  if (audioContext.state === 'suspended') {
    warningPending.add(key);
    audioContext.resume().then(() => {
      warningPending.delete(key);
      if (playWarningTone()) warningHistory.add(key);
    });
    return;
  }
  if (playWarningTone()) warningHistory.add(key);
}
function dismissWarning(key) {
  dismissedWarnings.add(key);
  render();
}
function driverQualificationMarkup(driver) {
  const allRuns = driverSchedule(driver);
  const runs = allRuns.some(isFinalRun) ? allRuns.filter(isFinalRun) : allRuns;
  const grouped = runs.reduce((groups, run) => { const key = `${run.cls}|${run.group}`; (groups[key] ||= []).push(run); return groups; }, {});
  return Object.values(grouped).map(group => { const nextRun = group.find(run => scheduleState(run).className !== 'finished') || group[group.length - 1]; const state = scheduleState(nextRun); return `<div class="driver-class-block"><strong class="driver-class-name">${nextRun.cls} · ${groupLabel(nextRun.group)}</strong><span class="driver-run ${state.className}"><b>${scheduleLabel(nextRun)}</b><span>${state.label}</span></span><small class="driver-run-detail">${state.detail}</small>${tyrePickerMarkup(driver, nextRun)}</div>`; }).join('') || '<small class="driver-run missing">Kein passender Zeitplan</small>';
}
function nextDriverRun(drivers) {
  const runs = drivers.flatMap(driver => driverSchedule(driver).map(run => ({ driver, run }))).filter(item => scheduleState(item.run).className !== 'finished');
  runs.sort((left, right) => scheduleSeconds(left.run.start) - scheduleSeconds(right.run.start));
  return runs[0] || null;
}
function bind() {
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { view = button.dataset.view; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view)); render(); });
  const mobileNavigation = document.querySelector('#mobile-navigation');
  if (mobileNavigation) { mobileNavigation.value = view.startsWith('analysis-') ? 'analysis' : view; mobileNavigation.onchange = event => { view = event.target.value; render(); }; }
  document.querySelectorAll('[data-import-type]').forEach(button => button.onclick = () => { document.querySelector('#file-input').dataset.importType = button.dataset.importType; document.querySelector('#file-input').click(); });
  document.querySelectorAll('[data-analysis-import]').forEach(button => button.onclick = () => { document.querySelector('#file-input').dataset.analysisImport = button.dataset.analysisImport; document.querySelector('#file-input').click(); });
  document.querySelectorAll('[data-driver]').forEach(button => button.onclick = () => toggleDriver(button.dataset.driver));
  document.querySelectorAll('[data-shift-run]').forEach(button => button.onclick = () => shiftNextRun(button.dataset.shiftRun, Number(button.dataset.shiftMinutes)));
  document.querySelectorAll('[data-dismiss-warning]').forEach(button => button.onclick = () => dismissWarning(button.dataset.dismissWarning));
}
function shiftNextRun(key, minutes) {
  data.scheduleAdjustments[key] = (data.scheduleAdjustments[key] || 0) + minutes;
  save();
  render();
  toast(`${minutes > 0 ? '+' : ''}${minutes} Minute angepasst.`);
}
// Unterstuetzte Formate:
// - RC-Timing/RCM: "Fronti [PW Cup Fronti] - Qualifikation - Gruppe 1" bzw. "... - Finale B",
//   Zeilen "2.   5580   1986   Hertz Tim   DEU   Club   2892138/0" (Name steht vor dem Laenderkuerzel)
//   oder ohne Kuerzel "6.   Schomaker Stefan   ART Wagenfeld   5671691/0" (Name ist die erste Textzelle)
// - Race-Control 2004: "Gruppe 1   •   Fun" bzw. "A-Finale Fun",
//   Zeilen "1   0   Fun   Rickfelder, Thilo   Club   40+   2839840" (Name mit Komma)
// Spalten sind im PDF-Text durch mehrere Leerzeichen getrennt (siehe extractPdfText).
const RC2004_NAME_CELL = /^\p{L}[\p{L}\s'.-]*,\s*\p{L}/u;
function parseDrivers(text) {
  let currentClass = '';
  let currentGroup = '';
  const drivers = [];
  const seen = new Set();
  text.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    const cells = rawLine.trim().split(/\s{2,}/);
    const rcmHeading = line.match(/^(.+?)\s*(?:\[([^\]]+)\])?\s*-\s*(?:(?:Qualifikation|Finale)\s*-\s*)?(?:Gruppe\s+(\d+)|Finale\s+([A-Z]))$/i);
    const rcGroupHeading = line.match(/^Gruppe\s+(\d+)\s*•\s*(.+)$/i);
    const rcFinalHeading = line.match(/^([A-Z])-Finale\s+(.+)$/i);
    if (rcmHeading) { currentClass = (rcmHeading[2] || rcmHeading[1]).trim(); currentGroup = rcmHeading[3] || `Finale ${rcmHeading[4].toUpperCase()}`; return; }
    if (rcGroupHeading) { currentClass = rcGroupHeading[2].trim(); currentGroup = rcGroupHeading[1]; return; }
    if (rcFinalHeading) { currentClass = rcFinalHeading[2].trim(); currentGroup = `Finale ${rcFinalHeading[1].toUpperCase()}`; return; }
    if (!currentClass) return;
    let rank = '';
    let name = '';
    const rcmRank = cells[0].match(/^(\d+)\.$/);
    if (rcmRank) {
      rank = rcmRank[1];
      // Mit Laenderkuerzel steht der Name direkt davor. Ohne Kuerzel ist er die erste Textzelle nach
      // der Platzierung (Liz.-Nr. und Zusatz sind Zahlen) - die Zelle vor dem Transponder waere der Club.
      const natIndex = cells.findIndex((cell, index) => index > 1 && /^[A-Z]{3}$/.test(cell));
      const firstTextCell = cells.slice(1).find(cell => /\p{L}/u.test(cell) && !/^[A-Z]{3}$/.test(cell) && !/^\S+\/\d+$/.test(cell));
      const nameCell = natIndex > 1 ? cells[natIndex - 1] : firstTextCell || line.match(/^\d+\.\s+(.+?)\s+[A-Z]{3}(?:\s|$)/)?.[1];
      if (!nameCell) return;
      const nameParts = nameCell.trim().split(' ');
      while (nameParts.length && /^\d+$/.test(nameParts[0])) nameParts.shift();
      name = nameParts.join(' ').trim();
    } else if (/^\d+$/.test(cells[0])) {
      const nameCell = cells.find(cell => RC2004_NAME_CELL.test(cell));
      if (!nameCell) return;
      rank = cells[0];
      name = nameCell.trim();
    } else return;
    if (!name) return;
    const id = `${currentClass}-${currentGroup}-${rank}-${name}`;
    if (!seen.has(id)) { seen.add(id); drivers.push({ id, name, cls: currentClass, group: currentGroup, number: rank, status: 'Bereit' }); }
  });
  return normalizeDrivers(drivers);
}
// Dauer "5:00" (Minuten:Sekunden) auf eine Startzeit aufschlagen, angebrochene Minuten zaehlen voll
function addDuration(start, duration) {
  const [minutes, seconds] = duration.split(':').map(Number);
  return shiftTime(start, minutes + (seconds > 0 ? 1 : 0));
}
// Ein neuer Zeitplan ersetzt nur die Laufarten, die er enthaelt: ein reiner Final-Zeitplan behaelt die Vorlaeufe
function mergeSchedule(current, imported) {
  const importedTypes = new Set(imported.map(entry => entry.raceType.toLocaleLowerCase('de-DE')));
  return [...current.filter(entry => !importedTypes.has(entry.raceType.toLocaleLowerCase('de-DE'))), ...imported].sort((left, right) => left.start.localeCompare(right.start));
}
function scheduleSummary(schedule) {
  const finals = schedule.filter(isFinalRun).length;
  return `${schedule.length - finals} Vorläufe · ${finals} Finalläufe`;
}
function parseSchedule(text) {
  const entries = [];
  const seen = new Set();
  const add = entry => {
    const key = `${entry.cls}|${entry.group}|${entry.raceType}|${entry.raceNumber}|${entry.start}`;
    if (!seen.has(key)) { seen.add(key); entries.push({ ...entry, status: 'next' }); }
  };
  text.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    // RC-Timing/RCM: "Fronti [PW Cup Fronti] Gruppe 1 Qualifikation 1 00:05 09:00 09:05"
    const rcm = line.match(/\[([^\]]+)\]\s+(Gruppe\s+\d+|Finale\s+[A-Z])\s+(Qualifikation|Finallauf)\s+(\d+)\s+\d{2}:\d{2}\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})/i);
    if (rcm) return add({ cls: rcm[1].trim(), group: rcm[2].replace(/^Gruppe\s+/i, '').trim(), raceType: rcm[3], raceNumber: rcm[4], start: rcm[5], end: rcm[6] });
    // Race-Control 2004 Vorlaeufe: "Gruppe 1 - Fun 5:00 08:30 09:50 11:10" (eine Startzeit je Vorlauf)
    const rcHeats = line.match(/^Gruppe\s+(\d+)\s+-\s+(.+?)\s+(\d{1,2}:\d{2})((?:\s+\d{1,2}:\d{2})+)$/i);
    if (rcHeats) return rcHeats[4].trim().split(' ').forEach((start, index) => add({ cls: rcHeats[2].trim(), group: rcHeats[1], raceType: 'Qualifikation', raceNumber: String(index + 1), start: start.padStart(5, '0'), end: addDuration(start.padStart(5, '0'), rcHeats[3]) }));
    // Race-Control 2004 Finale: "13:00 1. C-Finale Touring 5:00" (Laufnummer kann fehlen)
    const rcFinal = line.match(/^(\d{1,2}:\d{2})\s+(?:(\d+)\.\s+)?([A-Z])-Finale\s+(.+?)\s+(\d{1,2}:\d{2})$/i);
    if (rcFinal) { const start = rcFinal[1].padStart(5, '0'); add({ cls: rcFinal[4].trim(), group: `Finale ${rcFinal[3].toUpperCase()}`, raceType: 'Finallauf', raceNumber: rcFinal[2] || '1', start, end: addDuration(start, rcFinal[5]) }); }
  });
  return entries.sort((left, right) => left.start.localeCompare(right.start));
}
function parseLapAnalysis(text) {
  const header = text.match(/Klasse:\s*.*?\[([^\]]+)\].*?\n\s*(?:Gruppe\s+([^\s]+)|(Finale\s+[A-Z]))\s*-\s*(Qualifikation|Finallauf)\s+(\d+)/i);
  const drivers = [];
  const mainSection = text.split(/Rundenzeiten/i)[0];
  // Ergebniszeile: "Pos Nr Fahrer [DNS] Rundenzeit Rnd Absolutzeit Bestzeit Mediumzeit StDev"
  mainSection.split(/\r?\n/).forEach(line => {
    const match = line.replace(/\s+/g, ' ').trim().match(/^(\d+) (\d+) (.+?) (?:(DNS|DNF|DSQ) )?\d+\.\d+ (\d+) (\d+:\d+\.\d+) (\d+\.\d+) (\d+\.\d+)/);
    if (match) drivers.push({ name: formatDriverName(match[3].trim()), pos: Number(match[1]), nr: match[2], status: match[4] || '', lapCount: Number(match[5]), total: match[6], best: Number(match[7]), avg: Number(match[8]), laps: [] });
  });
  // Spalten der Rundentabelle gehoeren in Ergebnis-Reihenfolge zu den Fahrern mit Runden
  const withLaps = drivers.filter(driver => driver.lapCount > 0);
  const lapSection = text.match(/Rundenzeiten([\s\S]*?)(?:Top 10|Rekorde|P&W Cup|$)/i)?.[1] || '';
  const lines = lapSection.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const lapRows = lines.filter(line => /^\d+\s+/.test(line));
  lapRows.forEach(line => {
    const values = line.split(' ').slice(1).filter(value => /^\d+\.\d{3}$/.test(value));
    withLaps.forEach((driver, index) => { const value = Number(values[index]); if (Number.isFinite(value) && value > 0) driver.laps.push(value); });
  });
  return { recognized: !!header, cls: header?.[1] || 'Unbekannte Rennklasse', group: header?.[2] || header?.[3] || '-', raceType: header?.[4] || 'Qualifikation', raceNumber: header?.[5] || '1', drivers };
}
async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error('PDF-Leser konnte nicht geladen werden.');
  // Ueber einen Webserver (iPad) liegt der Worker in der App und funktioniert offline;
  // als Datei geoeffnet (file://) erlaubt der Browser keinen lokalen Worker, dann vom CDN
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = location.protocol.startsWith('http') ? 'vendor/pdf.worker.min.js' : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = {};
    content.items.forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!lines[y]) lines[y] = [];
      lines[y].push({ x: item.transform[4], text: item.str });
    });
    Object.keys(lines).sort((a, b) => Number(b) - Number(a)).forEach(y => pages.push(lines[y].sort((a, b) => a.x - b.x).map(item => item.text).join(' ').trim()));
  }
  return pages.join('\n');
}
const wmoLabel = code => code === 0 ? 'Sonnig' : code <= 2 ? 'Leicht bewölkt' : code === 3 ? 'Bedeckt' : code <= 48 ? 'Nebel' : code <= 55 ? 'Nieselregen' : code <= 67 ? 'Regen' : code <= 77 ? 'Schnee' : code <= 82 ? 'Regenschauer' : code <= 86 ? 'Schneeschauer' : 'Gewitter';
const wmoCondition = code => code === 0 ? 'sunny' : code <= 2 ? 'partly-cloudy' : code === 3 ? 'cloudy' : code <= 48 ? 'foggy' : code <= 67 ? 'rain' : code <= 77 ? 'snow' : code <= 82 ? 'rain' : code <= 86 ? 'snow' : 'storm';
const METEOCONS = 'https://cdn.jsdelivr.net/npm/@meteocons/svg@latest/fill/';
function weatherIconUrl(condition, wind) {
  if (wind > 30) return `${METEOCONS}wind.svg`;
  const map = { 'sunny': 'clear-day', 'partly-cloudy': 'partly-cloudy-day', 'cloudy': 'overcast', 'foggy': 'fog', 'rain': 'rain', 'snow': 'snow', 'storm': 'thunderstorms' };
  return `${METEOCONS}${map[condition] || 'overcast'}.svg`;
}
function weatherWidget() {
  const ws = data.weatherSettings;
  if (!ws.enabled) return '';
  if (!ws.lat) return '<div class="weather-widget weather-widget--setup"><span>⚙ Wetter-Standort in den Einstellungen festlegen</span></div>';
  if (!data.weatherCache) { fetchWeather(); return '<div class="weather-widget weather-widget--loading"><span>Wetterdaten werden geladen …</span></div>'; }
  const { temp, code, wind, precipNow, precipSoon } = data.weatherCache;
  const condition = wmoCondition(code);
  const rainRisk = precipNow >= 40 || precipSoon >= 40;
  const soonRisk = precipNow < 40 && precipSoon >= 40;
  const ago = Math.round((Date.now() - data.weatherCache.fetchedAt) / 60000);
  const precipBar = (pct, label) => `<div class="precip-row"><span class="precip-label">${label}</span><div class="precip-bar"><div class="precip-fill" style="width:${pct}%"></div><span class="precip-pct">${pct} %</span></div></div>`;
  return `<div class="weather-widget"><div class="weather-main"><img class="weather-icon-img" src="${weatherIconUrl(condition, wind)}" alt="${wmoLabel(code)}" width="64" height="64"><div class="weather-info"><span class="weather-temp">${temp}°C</span><span class="weather-desc">${wmoLabel(code)}${wind > 25 ? ` · ${wind} km/h Wind` : ''}</span><span class="weather-location">${ws.locationName}</span></div><button class="weather-refresh" data-action="refresh-weather" title="Wetter aktualisieren">↻ ${ago === 0 ? 'jetzt' : `${ago} Min.`}</button></div><div class="weather-precip">${precipBar(precipNow, 'Jetzt')}</div>${rainRisk ? `<div class="weather-rain-warning">⚠ ${soonRisk ? 'Regen in den nächsten 30 Min. möglich' : 'Regen in den nächsten 15 Min. möglich'}</div>` : ''}</div>`;
}
async function fetchWeather(force = false) {
  const ws = data.weatherSettings;
  if (!ws.enabled || !ws.lat || !ws.lon) return;
  const age = data.weatherCache?.fetchedAt ? Date.now() - data.weatherCache.fetchedAt : Infinity;
  if (!force && age < 10 * 60 * 1000) return;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ws.lat}&longitude=${ws.lon}&current=temperature_2m,weathercode,windspeed_10m&hourly=precipitation_probability&timezone=auto&forecast_days=1`);
    const json = await res.json();
    const h = new Date().getHours();
    data.weatherCache = { fetchedAt: Date.now(), temp: Math.round(json.current.temperature_2m), code: json.current.weathercode, wind: Math.round(json.current.windspeed_10m), precipNow: json.hourly.precipitation_probability[h] ?? 0, precipSoon: json.hourly.precipitation_probability[h + 1] ?? 0 };
    save();
    if (view === 'dashboard') dashboard();
  } catch (_) {}
}
async function geocodeLocation(query) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=de&format=json`);
  const json = await res.json();
  if (!json.results?.length) throw new Error('Ort nicht gefunden. Bitte anderen Namen versuchen.');
  const { latitude, longitude, name, admin1, country_code } = json.results[0];
  return { lat: latitude, lon: longitude, locationName: [name, admin1].filter(Boolean).join(', ') };
}
function startPage() {
  app.innerHTML = `<div class="eyebrow">Startseite</div><h1 class="page-title">Neuen Renntag<br>anlegen.</h1><p class="page-intro">Lege zuerst den Renntag an. Danach importierst du auf der zweiten Seite die Gruppeneinteilung aus der Zeitnahme.</p><section class="panel start-panel"><div class="start-icon">01</div><div><h2 class="panel-title">Renntag vorbereiten</h2><p class="page-intro">Importiere Fahrer und Rennklassen erst, wenn der Renntag aktiviert wurde.</p><button class="primary-button" data-action="new-race">+ Neuen Renntag anlegen</button></div></section>`;
  document.querySelector('[data-action="new-race"]').onclick = () => { data.renntag = { name: 'P&W Cup2026', date: '19. August 2026' }; data.importiert = false; save(); view = 'import'; render(); toast('Renntag angelegt. Jetzt Gruppeneinteilung importieren.'); };
}
function importPage() {
  const importCard = (type, title, description, imported, detail = '') => `<div class="import-box"><div class="import-icon">PDF</div><h3>${title}</h3><p>${description}</p><button class="secondary-button" data-import-type="${type}">PDF-Datei auswählen</button><span class="import-status ${imported ? 'ready' : ''}">${imported ? `Import vorhanden${detail ? ` · ${detail}` : ''}` : 'Noch nicht importiert'}</span></div>`;
  app.innerHTML = `<div class="eyebrow">${data.renntag.name}</div><h1 class="page-title">PDF-Import</h1><p class="page-intro">Lese die drei PDF-Dokumente getrennt ein. Jeder Import wird lokal für diesen Renntag gespeichert. Nach den Vorläufen importierst du die Gruppeneinteilung Finale. Enthält der Zeitplan noch keine Finalläufe, importierst du ihn erneut. Dabei bleiben die Vorläufe erhalten.</p><div class="import-grid">${importCard('vorlauf', 'Gruppeneinteilung Vorlauf', 'Fahrer, Rennklassen und Gruppen für die Vorläufe.', data.imports.vorlauf)}${importCard('finale', 'Gruppeneinteilung Finale', 'Fahrer, Rennklassen und Gruppen für die Finalläufe.', data.imports.finale)}${importCard('zeitplan', 'Zeitplan', 'Startzeiten und Reihenfolge der Vor- und Finalläufe. Nach den Vorläufen erneut importieren, falls die Finalläufe fehlen.', data.imports.zeitplan, scheduleSummary(data.schedule))}</div><section class="panel"><div class="panel-head"><h2 class="panel-title">Importstatus</h2><span class="panel-note">${data.drivers.length} Fahrer gespeichert · ${[data.imports.vorlauf, data.imports.finale, data.imports.zeitplan].filter(Boolean).length} / 3 Dateien vorhanden</span></div><div class="steps"><div class="step ${data.imports.vorlauf ? 'done' : 'active'}">1 <span>Gruppeneinteilung Vorlauf</span></div><div class="step ${data.imports.finale ? 'done' : ''}">2 <span>Gruppeneinteilung Finale</span></div><div class="step ${data.imports.zeitplan ? 'done' : ''}">3 <span>Zeitplan</span></div></div></section>`;
  bind();
}
function settingsPage() {
  const leadMinutes = Math.floor(data.alarmSettings.greaseLeadSeconds / 60);
  const leadSeconds = data.alarmSettings.greaseLeadSeconds % 60;
  app.innerHTML = `<div class="eyebrow">App-Verwaltung</div><h1 class="page-title">Einstellungen</h1><p class="page-intro">Verwalte die lokalen Daten, Uhrzeit und Warnungen für diesen Renntag.</p><section class="panel clock-panel"><div class="panel-head"><div><h2 class="panel-title">Test-Uhrzeit</h2><p class="settings-copy">Aktuell verwendet die App ${data.clock.testMode ? 'die vorgegebene Test-Uhrzeit' : 'die Uhrzeit des Rechners'}.</p></div><span class="clock-badge ${data.clock.testMode ? 'active' : ''}">${data.clock.testMode ? 'TEST AN' : 'RECHNER'}</span></div><div class="clock-controls"><label>Vorgegebene Uhrzeit<input id="test-time" type="time" value="${data.clock.testTime}"></label><button class="secondary-button" data-action="toggle-clock">${data.clock.testMode ? 'Test-Uhrzeit ausschalten' : 'Test-Uhrzeit einschalten'}</button></div><p class="current-clock">Verwendete Uhrzeit: <strong>${currentRaceTime()} Uhr</strong></p></section><section class="panel alarm-panel"><div class="panel-head"><div><h2 class="panel-title">Warnungen</h2><p class="settings-copy">Lege Alarmton, Vorlaufzeit und Zusatzalarm getrennt fest.</p></div><span class="clock-badge active">Alarm</span></div><div class="alarm-section tone-settings"><h3>1. Alarmton</h3><label class="tone-select-label">Tonquelle<select id="alarm-tone-mode"><option value="built-in" ${data.alarmSettings.toneMode === 'built-in' ? 'selected' : ''}>Vorhandene Sirene</option><option value="mp3" ${data.alarmSettings.toneMode === 'mp3' ? 'selected' : ''}>Eigene MP3-Datei</option></select></label><div class="mp3-controls"><button class="secondary-button" data-action="choose-mp3">MP3 auswählen</button><span>${data.alarmSettings.mp3Name || 'Keine eigene MP3 ausgewählt'}</span></div></div><div class="alarm-section alarm-setting"><h3>2. Hauptalarm</h3><strong>Reifen schmieren/Heizen</strong><span class="alarm-value">${leadMinutes} Min ${leadSeconds ? `${leadSeconds} Sek` : ''} vor dem Start</span><div class="alarm-adjustments"><button type="button" data-alarm-shift="grease" data-alarm-seconds="-300">- 5 Min</button><button type="button" data-alarm-shift="grease" data-alarm-seconds="-60">- 60 Sek</button><button type="button" data-alarm-shift="grease" data-alarm-seconds="60">+ 60 Sek</button><button type="button" data-alarm-shift="grease" data-alarm-seconds="300">+ 5 Min</button></div></div><div class="alarm-section extra-section"><div class="extra-alarm-row"><label class="check-setting"><input id="extra-alarm-enabled" type="checkbox" ${data.alarmSettings.extraEnabled ? 'checked' : ''}> <span>3. Zusatzalarm aktivieren</span></label><label class="extra-minutes-label">Minuten vor dem Start<input id="extra-alarm-minutes" type="number" min="1" max="180" step="1" value="${Math.floor(data.alarmSettings.extraLeadSeconds / 60)}"></label></div><label class="alarm-text-label">Hinweistext<input id="extra-alarm-text" maxlength="60" value="${data.alarmSettings.extraText}" placeholder="Maximal 60 Zeichen"><small>Maximal 60 Zeichen</small></label></div><div class="alarm-section volume-setting"><div><h3>4. Lautstärke</h3><label for="alarm-volume">Warnton-Lautstärke</label></div><input id="alarm-volume" type="range" min="0" max="100" value="${Math.round(data.alarmSettings.volume * 100)}"><output id="alarm-volume-value">${Math.round(data.alarmSettings.volume * 100)} %</output><button class="secondary-button" data-action="test-tone">${alarmTestActive ? 'Alarm stoppen' : 'Alarm testen'}</button></div></section><section class="panel weather-settings-panel"><div class="panel-head"><div><h2 class="panel-title">Wetter-Prognose</h2><p class="settings-copy">Zeigt Temperatur und Vorhersage im Dashboard an. Nutzt Open-Meteo (kostenlos, kein Konto nötig).</p></div><span class="clock-badge ${data.weatherSettings.enabled ? 'active' : ''}">${data.weatherSettings.enabled ? 'AN' : 'AUS'}</span></div><div class="weather-toggle-row"><button class="secondary-button" data-action="toggle-weather">${data.weatherSettings.enabled ? 'Wetter-Prognose deaktivieren' : 'Wetter-Prognose aktivieren'}</button></div>${data.weatherSettings.enabled ? `<div class="weather-location-row"><label>Ort oder Ortschaft<input id="weather-location-input" type="text" value="${data.weatherSettings.location}" placeholder="z. B. Rheda-Wiedenbrück"></label><button class="secondary-button" data-action="fetch-location">Ort suchen</button></div>${data.weatherSettings.locationName ? `<p class="weather-location-found">✓ ${data.weatherSettings.locationName} (${data.weatherSettings.lat?.toFixed(2)}, ${data.weatherSettings.lon?.toFixed(2)})</p>` : ''}` : ''}</section><section class="panel danger-panel"><h2 class="panel-title">Lokale Renntag-Daten löschen</h2><p class="page-intro">Löscht Renntag, Fahrer, Importe, Fahrer-Auswahl und Laufdaten von diesem Gerät. Das Reifen-Management bleibt erhalten: Reifensätze mit Lauf-Zählern, eigene Hersteller und Modelle, Reifen-Katalog und Einstellungen stehen für den nächsten Renntag weiter zur Verfügung.</p><button class="danger-button" data-action="clear-data">Alle Daten löschen</button></section>`;
  document.querySelector('#test-time').onchange = event => { data.clock.testTime = event.target.value || '09:00'; data.clock.testTimeStartedAt = Date.now(); save(); if (data.clock.testMode) render(); };
  document.querySelector('[data-action="toggle-clock"]').onclick = () => { data.clock.testMode = !data.clock.testMode; data.clock.testTimeStartedAt = Date.now(); save(); render(); toast(data.clock.testMode ? 'Test-Uhrzeit eingeschaltet.' : 'Rechner-Uhrzeit eingeschaltet.'); };
  document.querySelectorAll('[data-alarm-shift]').forEach(button => button.onclick = () => { data.alarmSettings.greaseLeadSeconds = Math.max(60, data.alarmSettings.greaseLeadSeconds + Number(button.dataset.alarmSeconds)); save(); render(); });
  document.querySelector('#extra-alarm-enabled').onchange = event => { data.alarmSettings.extraEnabled = event.target.checked; save(); };
  document.querySelector('#extra-alarm-minutes').oninput = event => { data.alarmSettings.extraLeadSeconds = Math.max(60, Math.min(10800, Number(event.target.value || 1) * 60)); save(); };
  document.querySelector('#extra-alarm-text').oninput = event => { data.alarmSettings.extraText = event.target.value.slice(0, 60); save(); };
  document.querySelector('#alarm-tone-mode').onchange = event => { data.alarmSettings.toneMode = event.target.value; save(); };
  document.querySelector('[data-action="choose-mp3"]').onclick = () => document.querySelector('#alarm-file-input').click();
  document.querySelector('#alarm-volume').oninput = event => { data.alarmSettings.volume = Number(event.target.value) / 100; document.querySelector('#alarm-volume-value').textContent = `${event.target.value} %`; save(); };
  document.querySelector('[data-action="test-tone"]').onclick = toggleAlarmTest;
  document.querySelector('[data-action="clear-data"]').onclick = () => { if (!window.confirm('Wirklich alle lokalen Renntag-Daten löschen?\n\nDas Reifen-Management (Reifensätze, Lauf-Zähler, Katalog, Einstellungen) bleibt erhalten.')) return; const kept = Object.fromEntries(TYRE_DATA_KEYS.filter(key => data[key] !== undefined).map(key => [key, data[key]])); localStorage.setItem('mg-race-data', JSON.stringify({ ...emptyRaceData(), ...kept })); window.location.reload(); };
  document.querySelector('[data-action="toggle-weather"]').onclick = () => { data.weatherSettings.enabled = !data.weatherSettings.enabled; save(); render(); };
  if (data.weatherSettings.enabled) {
    document.querySelector('[data-action="fetch-location"]').onclick = async () => {
      const input = document.querySelector('#weather-location-input').value.trim();
      if (!input) return toast('Bitte einen Ort eingeben.');
      try {
        toast('Ort wird gesucht …');
        const result = await geocodeLocation(input);
        data.weatherSettings = { ...data.weatherSettings, location: input, ...result };
        data.weatherCache = null;
        save();
        fetchWeather(true);
        render();
        toast(`Ort gefunden: ${result.locationName}`);
      } catch (err) { toast(`Ortssuche fehlgeschlagen: ${errorText(err)}`); }
    };
  }
}
let tyreFormOpen = false;
let tyreFormMfr = '';
let tyreFormAddingMfr = false;
let tyreFormEditingMfr = null;
let tyreFormAddingModel = false;
let tyreFormEditingModel = null;
let tyreFormModelIdx = null;
function getMergedCatalog() {
  const merged = {};
  Object.entries(activeTyreCatalog().catalog).forEach(([mfr, models]) => { merged[mfr] = [...models]; });
  Object.entries(data.customTyreCatalog).forEach(([mfr, models]) => {
    merged[mfr] = [...(merged[mfr] || []), ...models.map(m => ({ ...m, custom: true }))];
  });
  return merged;
}
const TYRE_SURFACES = { asphalt: 'Asphalt', carpet: 'Teppich', both: 'Asphalt & Teppich', unknown: 'ohne Angabe' };
const surfaceLabel = surface => TYRE_SURFACES[surface] || TYRE_SURFACES.unknown;
// Reifen-Dienst (tools/reifen-dienst.mjs): holt Katalog und Bestand von rc-kleinkram.de, weil der Browser das nicht direkt darf
const TYRE_SERVICE = 'http://127.0.0.1:47811';
const TYRE_SERVICE_MISSING = 'Reifen-Dienst läuft nicht. Bitte reifen-dienst-starten.cmd per Doppelklick starten.';
let tyreCatalogUpdating = false;
const tyreStockRequests = {};
// Katalog aus tyre-catalog.js oder, falls neuer, der zuletzt in der App aktualisierte Stand
function activeTyreCatalog() {
  const file = typeof TYRE_CATALOG === 'undefined' ? null : { meta: TYRE_CATALOG_META, catalog: TYRE_CATALOG };
  const stored = data.tyreCatalog;
  if (stored && (!file || stored.meta.updatedAt > file.meta.updatedAt)) return stored;
  return file || { meta: null, catalog: {} };
}
const formatStamp = iso => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function catalogInfo() {
  const { meta } = activeTyreCatalog();
  if (!meta) return 'Noch kein Reifen-Katalog vorhanden.';
  return `Katalog: ${meta.count} Kompletträder (Hohlkammer) von rc-kleinkram.de · Stand ${formatStamp(meta.updatedAt)} Uhr`;
}
async function tyreService(path, options) {
  let response;
  try { response = await fetch(`${TYRE_SERVICE}${path}`, options); } catch (error) { throw new Error(TYRE_SERVICE_MISSING); }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Reifen-Dienst meldet Fehler ${response.status}.`);
  return body;
}
async function refreshTyreCatalog() {
  if (tyreCatalogUpdating) return;
  tyreCatalogUpdating = true;
  render();
  try {
    const result = await tyreService('/katalog/aktualisieren', { method: 'POST' });
    data.tyreCatalog = result;
    tyreFormModelIdx = null;
    save();
    toast(`Reifen-Katalog aktualisiert: ${result.meta.count} Reifen.`);
  } catch (error) {
    toast(`Aktualisieren fehlgeschlagen: ${errorText(error)}`);
  }
  tyreCatalogUpdating = false;
  if (view === 'reifen') render();
}
// Live-Bestand von der Produktseite; Ergebnisse werden mit Zeitpunkt gespeichert und 5 Minuten wiederverwendet
function fetchLiveStock(url) {
  const cached = data.tyreStock[url];
  if (cached && Date.now() - new Date(cached.checkedAt).getTime() < 5 * 60 * 1000) return Promise.resolve(cached);
  tyreStockRequests[url] ||= tyreService(`/bestand?url=${encodeURIComponent(url)}`)
    .then(stock => { data.tyreStock[url] = stock; save(); return stock; })
    .finally(() => { delete tyreStockRequests[url]; });
  return tyreStockRequests[url];
}
function catalogModel(mfr, articleNo) {
  return (activeTyreCatalog().catalog[mfr] || []).find(model => model.articleNo === articleNo) || null;
}
// Neuester bekannter Bestand: letzte Live-Abfrage oder Stand der letzten Katalog-Aktualisierung
function knownStock(model) {
  if (!model?.url) return null;
  const live = data.tyreStock[model.url];
  const snapshot = model.stock ? { ...model.stock, checkedAt: activeTyreCatalog().meta.updatedAt } : null;
  if (!live) return snapshot;
  return !snapshot || live.checkedAt > snapshot.checkedAt ? live : snapshot;
}
const shortStockText = stock => stock.available === false ? 'Nicht lagernd' : stock.qty ? `${stock.qty} Stück lagernd` : stock.available ? 'Lieferbar' : 'Bestand unbekannt';
const stockCell = stock => stock
  ? `<span class="tyre-stock-state tyre-stock-state--${stock.available === true ? 'ok' : stock.available === false ? 'out' : 'unknown'}">${shortStockText(stock)}</span><small class="tyre-stock-date">Stand ${formatStamp(stock.checkedAt)}</small>`
  : '<span class="tyre-stock-state--unknown">—</span>';
// Bestand in "Meine Reifen" im Hintergrund live nachladen und nur die betroffenen Zellen aktualisieren
function refreshTableStock() {
  document.querySelectorAll('[data-tyre-row-stock]').forEach(cell => {
    const model = catalogModel(cell.dataset.tyreMfr, cell.dataset.tyreArticle);
    if (!model?.url) return;
    fetchLiveStock(model.url).then(() => { if (cell.isConnected) cell.innerHTML = stockCell(knownStock(model)); }).catch(() => {});
  });
}
const stockLine = stock => `<span class="tyre-stock-state tyre-stock-state--${stock.available === true ? 'ok' : stock.available === false ? 'out' : 'unknown'}">${stock.text}</span>`;
// Bestand des gewaehlten Modells: sofort der Stand aus dem Katalog, danach live vom Haendler
async function showTyreStock(model) {
  const box = document.querySelector('[data-tyre-stock]');
  if (!box) return;
  if (!model?.url) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  const link = `<a href="${model.url}" target="_blank" rel="noopener">Beim Händler ansehen</a>`;
  const snapshot = model.stock ? `<div>Stand ${formatStamp(activeTyreCatalog().meta.updatedAt)}: ${stockLine(model.stock)}</div>` : '';
  const draw = live => { box.innerHTML = `<strong>Bestand bei rc-kleinkram.de</strong>${live}${snapshot}${link}`; };
  draw('<div class="tyre-stock-pending">Aktueller Bestand wird abgefragt …</div>');
  try {
    const stock = await fetchLiveStock(model.url);
    if (box.isConnected && box.dataset.tyreStock === model.url) draw(`<div>Aktuell (${formatStamp(stock.checkedAt)}): ${stockLine(stock)}</div>`);
  } catch (error) {
    if (box.isConnected && box.dataset.tyreStock === model.url) draw(`<div class="tyre-stock-pending">Live-Abfrage nicht möglich: ${errorText(error)}</div>`);
  }
}
// --- Reifensaetze: eine Zeile = ein Satz mit eindeutiger Reifen-Nr. und eigenem Lauf-Zaehler ---
function tyreNoKey(value) { return String(value ?? '').trim().toLocaleLowerCase('de-DE'); }
function freeTyreNumbers(count, taken = new Set(data.tyres.map(tyre => tyreNoKey(tyre.tyreNo)))) {
  const numbers = [];
  for (let n = 1; numbers.length < count; n += 1) if (!taken.has(String(n))) { numbers.push(String(n)); taken.add(String(n)); }
  return numbers;
}
// Nummern fuer neue Saetze: ab der eingegebenen Nummer hochzaehlen ("42" -> 42, 43 …; "7-A" -> 7-A, 7-A-2 …), leer = naechste freie Zahl
function newTyreNumbers(first, count) {
  if (!first) return freeTyreNumbers(count);
  const match = /^(.*?)(\d+)$/.exec(first);
  return Array.from({ length: count }, (_, i) => i === 0 ? first : match ? `${match[1]}${String(Number(match[2]) + i).padStart(match[2].length, '0')}` : `${first}-${i + 1}`);
}
// Alte Eintraege mit mehreren Paaren in einzelne Saetze aufteilen; jeder Satz bekommt eine eindeutige Nummer
function migrateTyreSets() {
  const taken = new Set();
  const ids = new Set();
  // Bestehende IDs bleiben erhalten (Reifen-Auswahl im Dashboard verweist darauf); neue Saetze bekommen freie IDs
  let nextId = Math.max(Date.now(), ...data.tyres.map(tyre => Number(tyre.id) || 0)) + 1;
  const sets = [];
  data.tyres.forEach(tyre => {
    const count = Math.max(1, Number(tyre.qty) || 1);
    for (let i = 0; i < count; i += 1) {
      const set = { ...tyre, runs: Number(tyre.runs) || 0, history: tyre.history || [] };
      delete set.qty;
      if (i > 0) { set.tyreNo = ''; set.runs = 0; set.history = []; }
      const key = tyreNoKey(set.tyreNo);
      if (!key || taken.has(key)) set.tyreNo = '';
      else taken.add(key);
      const id = Number(set.id);
      set.id = i === 0 && id && !ids.has(id) ? id : nextId++;
      ids.add(set.id);
      sets.push(set);
    }
  });
  sets.filter(set => !set.tyreNo).forEach(set => { [set.tyreNo] = freeTyreNumbers(1, taken); });
  data.tyres = sets;
}
const tyreById = id => data.tyres.find(tyre => String(tyre.id) === String(id)) || null;
const tyreLabel = tyre => `#${tyre.tyreNo} · ${tyre.mfr} ${tyre.name}`;
const runsLabel = runs => `${runs} Lauf${runs === 1 ? '' : 'e'}`;
const isWorn = tyre => data.tyreSettings.wearRuns > 0 && (tyre.runs || 0) >= data.tyreSettings.wearRuns;
// Belag passt nicht: nur wenn Renntag und Reifen eindeutig Asphalt bzw. Teppich sind
const surfaceMismatch = tyre => ['asphalt', 'carpet'].includes(data.renntag?.surface) && ['asphalt', 'carpet'].includes(tyre.surface) && tyre.surface !== data.renntag.surface;
function myDriver() {
  return data.myDriverId ? data.drivers.find(driver => String(driver.id || driver.number) === String(data.myDriverId)) || null : null;
}
// Schluessel eines Laufs am aktuellen Renntag; bleibt bei Zeitverschiebungen gleich
const raceDayRunKey = run => `${data.renntag?.name || ''}|${data.renntag?.date || ''}|${scheduleKey(run)}`;
// Reifensaetze, die am Renntag in einer Klasse eingesetzt bzw. fuer einen Lauf gewaehlt sind
function tyresUsedInClass(cls) {
  const driver = myDriver();
  if (!driver) return new Set();
  return new Set(driverSchedule(driver).filter(run => run.cls === cls).map(run => data.tyreSelections[raceDayRunKey(run)]).filter(Boolean).map(String));
}
function selectTyreForRun(runKey, tyreId, cls) {
  // erneuter Klick: bewusst kein Reifen (null), damit der Vorgaenger-Reifen nicht wieder uebernommen wird
  if (String(data.tyreSelections[runKey]) === String(tyreId)) { data.tyreSelections[runKey] = null; save(); return render(); }
  data.tyreSelections[runKey] = tyreId;
  save();
  render();
  const tyre = tyreById(tyreId);
  const used = tyresUsedInClass(cls).size;
  const notes = [];
  if (data.tyreSettings.classLimit > 0 && used > data.tyreSettings.classLimit) notes.push(`${used} Reifensätze in ${cls} – erlaubt sind ${data.tyreSettings.classLimit}`);
  if (tyre && isWorn(tyre)) notes.push(`Reifen #${tyre.tyreNo} hat schon ${runsLabel(tyre.runs)}`);
  if (tyre && surfaceMismatch(tyre)) notes.push(`Reifen #${tyre.tyreNo} ist ein ${surfaceLabel(tyre.surface)}-Reifen`);
  toast(notes.length ? `Achtung: ${notes.join(' · ')}.` : `Reifen #${tyre?.tyreNo} für den Lauf gewählt.`);
}
// Der eingesetzte Reifen bleibt je Klasse drauf, bis ein anderer gewaehlt wird: Laeufe ohne eigene Auswahl
// uebernehmen den Reifen des vorherigen Laufs derselben Klasse (bis einschliesslich zum naechsten offenen Lauf).
// Jeder beendete Lauf mit Reifen wird genau einmal gezaehlt (Endzeit inkl. Zeitverschiebung).
function processTyreCounts() {
  const driver = myDriver();
  if (!driver || !data.renntag) return;
  const counted = [];
  const mounted = {};
  const open = new Set();
  let changed = false;
  driverSchedule(driver).forEach(run => {
    const key = raceDayRunKey(run);
    const finished = scheduleState(run).className === 'finished';
    if (open.has(run.cls)) return;
    if (!(key in data.tyreSelections) && mounted[run.cls]) { data.tyreSelections[key] = mounted[run.cls]; changed = true; }
    if (data.tyreSelections[key] !== undefined) mounted[run.cls] = data.tyreSelections[key];
    if (!finished) { open.add(run.cls); return; }
    const tyre = tyreById(data.tyreSelections[key]);
    if (!tyre || data.tyreCounted[key]) return;
    tyre.runs = (tyre.runs || 0) + 1;
    tyre.history = [{ at: new Date().toISOString(), text: `${data.renntag.name} · ${run.cls} · ${scheduleLabel(run)}` }, ...(tyre.history || [])].slice(0, 30);
    data.tyreCounted[key] = true;
    counted.push(`#${tyre.tyreNo}: ${runsLabel(tyre.runs)}`);
  });
  if (changed) save();
  if (!counted.length) return;
  save();
  toast(`Lauf beendet – Reifen gezählt (${counted.join(', ')}).`);
  if (view === 'reifen') render();
}
// Reifen-Auswahl je Klasse im Dashboard (nur beim eigenen Fahrer): naechster offener Lauf der Klasse
function tyrePickerMarkup(driver, run) {
  if (!myDriver() || String(driver.id || driver.number) !== String(data.myDriverId)) return '';
  const classRuns = driverSchedule(driver).filter(item => item.cls === run.cls);
  const lastRun = [...classRuns].reverse().find(item => scheduleState(item).className === 'finished' && data.tyreSelections[raceDayRunKey(item)]);
  const lastTyre = lastRun ? tyreById(data.tyreSelections[raceDayRunKey(lastRun)]) : null;
  const last = lastTyre ? `<small class="tyre-pick-last">Letzter Lauf (${scheduleLabel(lastRun)}): Reifen #${lastTyre.tyreNo} · ${data.tyreCounted[raceDayRunKey(lastRun)] ? 'gezählt ✓' : 'wird gezählt'}</small>` : '';
  if (scheduleState(run).className === 'finished') return last ? `<div class="tyre-pick">${last}</div>` : '';
  const key = raceDayRunKey(run);
  const selectedId = data.tyreSelections[key];
  const available = data.tyres.filter(tyre => tyre.forRace || String(tyre.id) === String(selectedId));
  if (!available.length) return `<div class="tyre-pick"><small class="tyre-pick-empty">Keine Reifen für den Renntag markiert. <button type="button" class="tyre-pick-link" data-view="reifen">Im Reifen-Management anhaken</button></small>${last}</div>`;
  const chips = available.map(tyre => {
    const classes = ['tyre-chip', String(tyre.id) === String(selectedId) ? 'selected' : '', isWorn(tyre) ? 'worn' : '', surfaceMismatch(tyre) ? 'mismatch' : ''].filter(Boolean).join(' ');
    const hints = [isWorn(tyre) ? 'Verschleiß-Grenze' : '', surfaceMismatch(tyre) ? `${surfaceLabel(tyre.surface)}-Reifen` : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="${classes}" data-pick-tyre="${tyre.id}" data-pick-run="${key}" data-pick-class="${run.cls}" title="${tyreLabel(tyre)}${hints ? ` – ${hints}` : ''}"><b>#${tyre.tyreNo}</b><span>${tyre.name}</span><small>${runsLabel(tyre.runs || 0)}${hints ? ` · ${hints}` : ''}</small></button>`;
  }).join('');
  const used = tyresUsedInClass(run.cls).size;
  const limitWarning = data.tyreSettings.classLimit > 0 && used > data.tyreSettings.classLimit ? `<small class="tyre-pick-warn">Achtung: ${used} Reifensätze in ${run.cls} eingesetzt – erlaubt sind ${data.tyreSettings.classLimit}.</small>` : '';
  return `<div class="tyre-pick"><span class="tyre-pick-label">Reifen für ${scheduleLabel(run)}${selectedId ? '' : ' – noch keiner gewählt'}</span><div class="tyre-pick-chips">${chips}</div>${limitWarning}${last}</div>`;
}
function isCustomMfr(mfr) { return !!data.customTyreCatalog[mfr]; }
function tyrePage() {
  const catalog = getMergedCatalog();
  const manufacturers = Object.keys(catalog).sort((a, b) => a.localeCompare(b, 'de-DE'));
  const models = (tyreFormMfr && tyreFormMfr !== '__new__') ? (catalog[tyreFormMfr] || []) : [];
  const surfaceBadge = s => `<span class="tyre-badge tyre-badge--${TYRE_SURFACES[s] ? s : 'unknown'}">${surfaceLabel(s)}</span>`;
  const raceCount = data.tyres.filter(t => t.forRace).length;

  const editMfrEntry = tyreFormEditingMfr !== null ? data.customTyreCatalog[tyreFormEditingMfr] : null;
  const mfrInputBlock = (tyreFormAddingMfr || tyreFormEditingMfr !== null) ? `
    <div class="tyre-inline-input-row">
      <input id="tyre-new-mfr-input" class="tyre-inline-input" type="text" placeholder="Hersteller-Name eingeben …" value="${tyreFormEditingMfr !== null ? tyreFormEditingMfr : ''}">
      <button class="secondary-button" data-action="tyre-save-mfr">${tyreFormEditingMfr !== null ? 'Speichern' : 'Übernehmen'}</button>
      <button class="text-button" data-action="tyre-cancel-mfr">Abbrechen</button>
      ${tyreFormEditingMfr !== null ? `<button class="tyre-delete-btn" data-action="tyre-delete-mfr" title="Hersteller löschen">✕</button>` : ''}
    </div>` : '';

  const editModelEntry = tyreFormEditingModel !== null ? models[tyreFormEditingModel] : null;
  const modelInputBlock = (tyreFormAddingModel || tyreFormEditingModel !== null) ? `
    <div class="tyre-inline-input-row tyre-model-input-row">
      <input id="tyre-new-art-input" class="tyre-inline-input" type="text" placeholder="Art.-Nr." style="max-width:130px" value="${editModelEntry?.articleNo || ''}">
      <input id="tyre-new-model-input" class="tyre-inline-input" type="text" placeholder="Bezeichnung (z. B. Compound 28° Asphalt)" value="${editModelEntry?.name || ''}">
      ${Object.entries(TYRE_SURFACES).map(([value, label]) => `<label class="tyre-inline-surface"><input type="radio" name="tyre-surface" value="${value}" ${(editModelEntry?.surface || 'asphalt') === value ? 'checked' : ''}> ${label}</label>`).join('')}
      <button class="secondary-button" data-action="tyre-save-model">${tyreFormEditingModel !== null ? 'Speichern' : 'Übernehmen'}</button>
      <button class="text-button" data-action="tyre-cancel-model">Abbrechen</button>
      ${tyreFormEditingModel !== null ? `<button class="tyre-delete-btn" data-action="tyre-delete-model" title="Modell löschen">✕</button>` : ''}
    </div>` : '';

  const canEditMfr = tyreFormMfr && tyreFormMfr !== '__new__' && isCustomMfr(tyreFormMfr) && !tyreFormEditingMfr && !tyreFormAddingMfr;
  const canDeleteMfrDirect = canEditMfr;
  const selectedModel = tyreFormModelIdx !== null ? models[tyreFormModelIdx] : null;
  const canEditModel = tyreFormMfr && !tyreFormAddingModel && !tyreFormEditingModel;
  const canDeleteModelDirect = canEditModel && tyreFormModelIdx !== null && selectedModel?.custom;

  const formHtml = tyreFormOpen ? `
    <div class="tyre-form-panel">
      <h3 class="tyre-form-title">Neues Reifen-Paar erfassen</h3>
      <div class="tyre-catalog-row"><p class="tyre-catalog-info">${catalogInfo()}</p><button class="text-button" data-action="tyre-refresh-catalog" ${tyreCatalogUpdating ? 'disabled' : ''}>${tyreCatalogUpdating ? 'Katalog wird aktualisiert … (ca. 30 Sekunden)' : '↻ Katalog aktualisieren'}</button></div>
      <div class="tyre-form-row tyre-form-row--4col">
        <div class="tyre-form-col">
          <label class="tyre-form-label">1. Hersteller
            <div class="tyre-select-row">
              <select id="tyre-mfr-select" class="tyre-select">
                <option value="">— Hersteller wählen —</option>
                ${manufacturers.map(m => `<option value="${m}" ${m === tyreFormMfr ? 'selected' : ''}>${m}${isCustomMfr(m) ? ' ✎' : ''}</option>`).join('')}
                <option value="__new__">＋ Hersteller hinzufügen …</option>
              </select>
              ${canEditMfr ? `<button class="tyre-edit-btn" data-action="tyre-edit-mfr" title="Hersteller bearbeiten">✎</button>` : ''}
              ${canDeleteMfrDirect ? `<button class="tyre-delete-btn" data-action="tyre-delete-mfr-direct" title="Hersteller löschen">✕</button>` : ''}
            </div>
          </label>
          ${mfrInputBlock}
        </div>
        <div class="tyre-form-col ${!tyreFormMfr || tyreFormMfr === '__new__' ? 'tyre-form-label--disabled' : ''}">
          <label class="tyre-form-label">2. Modell
            <div class="tyre-select-row">
              <select id="tyre-model-select" class="tyre-select" ${!tyreFormMfr || tyreFormMfr === '__new__' ? 'disabled' : ''}>
                <option value="">— Modell wählen —</option>
                ${models.map((m, i) => `<option value="${i}" ${tyreFormModelIdx === i ? 'selected' : ''}>${m.articleNo} · ${m.name} · ${surfaceLabel(m.surface)}</option>`).join('')}
                ${tyreFormMfr && tyreFormMfr !== '__new__' ? `<option value="__new__">＋ Modell hinzufügen …</option>` : ''}
              </select>
              ${canEditModel ? `<button class="tyre-edit-btn" data-action="tyre-edit-model-btn" title="Ausgewähltes Modell bearbeiten">✎</button>` : ''}
              ${canDeleteModelDirect ? `<button class="tyre-delete-btn" data-action="tyre-delete-model-direct" title="Modell löschen">✕</button>` : ''}
            </div>
          </label>
          ${modelInputBlock}
        </div>
        <label class="tyre-form-label tyre-form-label--qty">3. Anzahl Sätze
          <input id="tyre-qty-input" type="number" min="1" max="20" value="1" class="tyre-qty-input">
        </label>
        <label class="tyre-form-label tyre-form-label--qty">4. Reifen-Nr. (1. Satz)
          <input id="tyre-no-input" type="text" maxlength="20" placeholder="automatisch" class="tyre-qty-input" style="text-align:left">
        </label>
      </div>
      <div class="tyre-stock" data-tyre-stock="${selectedModel?.url || ''}" hidden></div>
      <div class="tyre-form-actions">
        <button class="primary-button" data-action="tyre-add">Hinzufügen</button>
        <button class="text-button" data-action="tyre-cancel">Abbrechen</button>
      </div>
    </div>` : '';

  const tableRows = data.tyres.length ? data.tyres.map((t, i) => `
    <tr class="${t.forRace ? 'tyre-row--active' : ''}">
      <td class="tyre-check-cell"><label class="tyre-checkbox-wrap"><input type="checkbox" data-tyre-race="${i}" ${t.forRace ? 'checked' : ''}><span class="tyre-checkbox"></span></label></td>
      <td class="tyre-cell-no"><input class="tyre-no-cell-input" type="text" maxlength="20" value="${t.tyreNo}" data-tyre-no="${i}" title="Reifen-Nr. (eindeutig je Satz)"></td>
      <td class="tyre-cell-mfr">${t.mfr}</td>
      <td class="tyre-cell-name">${t.name}</td>
      <td class="tyre-cell-art">${t.articleNo}</td>
      <td>${surfaceBadge(t.surface)}</td>
      <td class="tyre-check-cell" title="Reifen mit Reifenkante"><label class="tyre-checkbox-wrap"><input type="checkbox" data-tyre-edge="${i}" ${t.edge ? 'checked' : ''} aria-label="Reifenkante"><span class="tyre-checkbox"></span></label></td>
      <td class="tyre-cell-runs ${isWorn(t) ? 'tyre-cell-runs--worn' : ''}" title="${(t.history || []).length ? `Letzte Einsätze:\n${t.history.slice(0, 10).map(entry => `${formatStamp(entry.at)} – ${entry.text}`).join('\n')}` : 'Noch keine Einsätze'}"><b>${t.runs || 0}</b></td>
      <td class="tyre-cell-stock" data-tyre-row-stock data-tyre-mfr="${t.mfr}" data-tyre-article="${t.articleNo}">${stockCell(knownStock(catalogModel(t.mfr, t.articleNo)))}</td>
      <td><button class="tyre-delete-btn" data-tyre-delete="${i}" title="Löschen">✕</button></td>
    </tr>`).join('') : `<tr><td colspan="10" class="tyre-empty">Noch keine Reifen erfasst. Klicke auf „+ Neu" um einen Reifen hinzuzufügen.</td></tr>`;

  app.innerHTML = `
    <div class="eyebrow">${data.renntag?.name || 'Reifen-Management'}</div>
    <h1 class="page-title">Reifen-Management</h1>
    <p class="page-intro">Verwalte deine Reifensätze – jede Zeile ist ein Satz mit eigener Reifen-Nr. und Lauf-Zähler. Hake an, welche Sätze dir am Renntag im Dashboard zur Auswahl stehen.</p>
    <div class="tyre-toolbar">
      <div class="tyre-toolbar-left">
        <button class="primary-button" data-action="tyre-new">+ Neu</button>
        ${raceCount ? `<span class="tyre-race-count">${raceCount} ${raceCount === 1 ? 'Satz' : 'Sätze'} für Renntag markiert</span>` : ''}
      </div>
    </div>
    ${formHtml}
    <section class="panel tyre-panel">
      <div class="panel-head">
        <h2 class="panel-title">Meine Reifen</h2>
        <span class="panel-note">${data.tyres.length} Eintrag${data.tyres.length !== 1 ? 'e' : ''}</span>
      </div>
      <div class="tyre-table-wrap">
        <table class="tyre-table">
          <thead><tr>
            <th class="tyre-th-check" title="Für Renntag">✓</th>
            <th>Reifen-Nr.</th><th>Hersteller</th><th>Bezeichnung</th><th>Art.-Nr.</th><th>Oberfläche</th><th class="tyre-th-edge" title="Häkchen setzen, wenn der Reifensatz eine Reifenkante hat">Reifenkante</th><th title="Gefahrene Läufe, wird nach jedem Lauf automatisch erhöht">Läufe</th><th>Bestand Händler</th><th></th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </section>
    <section class="panel tyre-settings-panel">
      <div class="panel-head"><h2 class="panel-title">Reifen-Einsatz</h2><span class="panel-note">Angehakte Sätze stehen im Dashboard zur Auswahl; nach jedem Lauf wird der Zähler automatisch erhöht.</span></div>
      <div class="tyre-settings-row">
        <label>Max. Reifensätze je Klasse und Renntag<input id="tyre-class-limit" type="number" min="0" max="20" value="${data.tyreSettings.classLimit}"><small>0 = keine Warnung (z. B. TOS-Reglement: 2)</small></label>
        <label>Verschleiß-Warnung ab Läufen<input id="tyre-wear-runs" type="number" min="0" max="200" value="${data.tyreSettings.wearRuns}"><small>0 = keine Warnung</small></label>
        <label>Belag am Renntag<select id="tyre-race-surface"><option value="">nicht festgelegt</option><option value="asphalt" ${data.renntag?.surface === 'asphalt' ? 'selected' : ''}>Asphalt</option><option value="carpet" ${data.renntag?.surface === 'carpet' ? 'selected' : ''}>Teppich</option></select><small>Hinweis bei Reifen für den anderen Belag</small></label>
      </div>
    </section>`;

  // --- Event Handler ---
  document.querySelector('[data-action="tyre-new"]').onclick = () => { tyreFormOpen = !tyreFormOpen; tyreFormMfr = ''; tyreFormAddingMfr = false; tyreFormAddingModel = false; tyreFormEditingMfr = null; tyreFormEditingModel = null; render(); };
  const cancelBtn = document.querySelector('[data-action="tyre-cancel"]');
  if (cancelBtn) cancelBtn.onclick = () => { tyreFormOpen = false; tyreFormMfr = ''; tyreFormAddingMfr = false; tyreFormAddingModel = false; tyreFormEditingMfr = null; tyreFormEditingModel = null; render(); };

  // Hersteller-Dropdown
  const mfrSelect = document.querySelector('#tyre-mfr-select');
  if (mfrSelect) mfrSelect.addEventListener('change', e => {
    tyreFormMfr = e.target.value;
    tyreFormAddingMfr = tyreFormMfr === '__new__';
    tyreFormAddingModel = false; tyreFormEditingMfr = null; tyreFormEditingModel = null; tyreFormModelIdx = null;
    render();
  });

  // Hersteller hinzufügen / speichern
  const saveMfrBtn = document.querySelector('[data-action="tyre-save-mfr"]');
  if (saveMfrBtn) saveMfrBtn.onclick = () => {
    const val = document.querySelector('#tyre-new-mfr-input')?.value.trim();
    if (!val) return toast('Bitte einen Hersteller-Namen eingeben.');
    if (tyreFormEditingMfr !== null) {
      const oldName = tyreFormEditingMfr;
      const models = data.customTyreCatalog[oldName] || [];
      delete data.customTyreCatalog[oldName];
      data.customTyreCatalog[val] = models;
      data.tyres.forEach(t => { if (t.mfr === oldName) t.mfr = val; });
      tyreFormMfr = val; tyreFormEditingMfr = null;
    } else {
      if (!data.customTyreCatalog[val]) data.customTyreCatalog[val] = [];
      tyreFormMfr = val; tyreFormAddingMfr = false;
    }
    save(); render(); toast(`Hersteller „${val}" gespeichert.`);
  };
  const cancelMfrBtn = document.querySelector('[data-action="tyre-cancel-mfr"]');
  if (cancelMfrBtn) cancelMfrBtn.onclick = () => { tyreFormAddingMfr = false; tyreFormEditingMfr = null; if (tyreFormMfr === '__new__') tyreFormMfr = ''; render(); };
  const editMfrBtn = document.querySelector('[data-action="tyre-edit-mfr"]');
  if (editMfrBtn) editMfrBtn.onclick = () => { tyreFormEditingMfr = tyreFormMfr; tyreFormAddingMfr = false; render(); };
  const deleteMfrBtn = document.querySelector('[data-action="tyre-delete-mfr"]');
  if (deleteMfrBtn) deleteMfrBtn.onclick = () => {
    if (!window.confirm(`Hersteller „${tyreFormEditingMfr}" und alle seine Modelle aus dem Katalog löschen?`)) return;
    delete data.customTyreCatalog[tyreFormEditingMfr];
    tyreFormMfr = ''; tyreFormEditingMfr = null; save(); render(); toast('Hersteller gelöscht.');
  };
  const deleteMfrDirectBtn = document.querySelector('[data-action="tyre-delete-mfr-direct"]');
  if (deleteMfrDirectBtn) deleteMfrDirectBtn.onclick = () => {
    if (!window.confirm(`Hersteller „${tyreFormMfr}" und alle seine Modelle aus dem Katalog löschen?`)) return;
    delete data.customTyreCatalog[tyreFormMfr];
    tyreFormMfr = ''; tyreFormModelIdx = null; save(); render(); toast('Hersteller gelöscht.');
  };

  // Modell-Dropdown
  const modelSelect = document.querySelector('#tyre-model-select');
  if (modelSelect) modelSelect.addEventListener('change', e => {
    const val = e.target.value;
    if (val === '__new__') {
      tyreFormAddingModel = true; tyreFormEditingModel = null; tyreFormModelIdx = null; render();
    } else {
      tyreFormAddingModel = false; tyreFormEditingModel = null;
      tyreFormModelIdx = val === '' ? null : Number(val);
      const stockBox = document.querySelector('[data-tyre-stock]');
      const model = tyreFormModelIdx === null ? null : models[tyreFormModelIdx];
      if (stockBox) stockBox.dataset.tyreStock = model?.url || '';
      showTyreStock(model);
    }
  });
  const refreshCatalogBtn = document.querySelector('[data-action="tyre-refresh-catalog"]');
  if (refreshCatalogBtn) refreshCatalogBtn.onclick = refreshTyreCatalog;
  if (tyreFormOpen) showTyreStock(selectedModel);
  refreshTableStock();

  // Modell bearbeiten (Edit-Button neben Dropdown)
  const editModelBtn = document.querySelector('[data-action="tyre-edit-model-btn"]');
  if (editModelBtn) editModelBtn.onclick = () => {
    const idx = document.querySelector('#tyre-model-select')?.value;
    if (!idx || idx === '' || idx === '__new__') return toast('Bitte zuerst ein Modell auswählen.');
    const m = models[Number(idx)];
    if (!m?.custom) return toast('Nur manuell erfasste Modelle können bearbeitet werden.');
    tyreFormEditingModel = Number(idx); tyreFormAddingModel = false; render();
  };

  // Modell hinzufügen / speichern
  const saveModelBtn = document.querySelector('[data-action="tyre-save-model"]');
  if (saveModelBtn) saveModelBtn.onclick = () => {
    const art = document.querySelector('#tyre-new-art-input')?.value.trim();
    const name = document.querySelector('#tyre-new-model-input')?.value.trim();
    const surface = document.querySelector('input[name="tyre-surface"]:checked')?.value || 'asphalt';
    if (!name) return toast('Bitte eine Bezeichnung eingeben.');
    if (!data.customTyreCatalog[tyreFormMfr]) data.customTyreCatalog[tyreFormMfr] = [];
    if (tyreFormEditingModel !== null) {
      const customModels = data.customTyreCatalog[tyreFormMfr];
      const customIdx = models.slice(0, tyreFormEditingModel + 1).filter(m => m.custom).length - 1;
      customModels[customIdx] = { articleNo: art, name, surface, custom: true };
      tyreFormEditingModel = null;
    } else {
      data.customTyreCatalog[tyreFormMfr].push({ articleNo: art, name, surface, custom: true });
      tyreFormAddingModel = false;
    }
    save(); render(); toast(`Modell „${name}" gespeichert.`);
  };
  const cancelModelBtn = document.querySelector('[data-action="tyre-cancel-model"]');
  if (cancelModelBtn) cancelModelBtn.onclick = () => { tyreFormAddingModel = false; tyreFormEditingModel = null; render(); };
  const deleteModelBtn = document.querySelector('[data-action="tyre-delete-model"]');
  if (deleteModelBtn) deleteModelBtn.onclick = () => {
    if (!window.confirm('Dieses Modell aus dem Katalog löschen?')) return;
    const customModels = data.customTyreCatalog[tyreFormMfr];
    const customIdx = models.slice(0, tyreFormEditingModel + 1).filter(m => m.custom).length - 1;
    customModels.splice(customIdx, 1);
    tyreFormEditingModel = null; save(); render(); toast('Modell gelöscht.');
  };
  const deleteModelDirectBtn = document.querySelector('[data-action="tyre-delete-model-direct"]');
  if (deleteModelDirectBtn) deleteModelDirectBtn.onclick = () => {
    if (tyreFormModelIdx === null) return;
    const m = models[tyreFormModelIdx];
    if (!m?.custom) return toast('Nur manuell erfasste Modelle können gelöscht werden.');
    if (!window.confirm(`Modell „${m.name}" aus dem Katalog löschen?`)) return;
    const customModels = data.customTyreCatalog[tyreFormMfr];
    const customIdx = models.slice(0, tyreFormModelIdx + 1).filter(x => x.custom).length - 1;
    customModels.splice(customIdx, 1);
    tyreFormModelIdx = null; save(); render(); toast('Modell gelöscht.');
  };

  // Reifen hinzufügen
  const addBtn = document.querySelector('[data-action="tyre-add"]');
  if (addBtn) addBtn.onclick = () => {
    const qty = parseInt(document.querySelector('#tyre-qty-input')?.value || '1', 10);
    const tyreNo = (document.querySelector('#tyre-no-input')?.value || '').trim();
    if (!tyreFormMfr || tyreFormModelIdx === null) return toast('Bitte Hersteller und Modell auswählen.');
    const model = models[tyreFormModelIdx];
    if (!model) return toast('Ungültiges Modell – bitte erneut auswählen.');
    const count = Math.min(20, Math.max(1, qty || 1));
    const numbers = newTyreNumbers(tyreNo, count);
    const taken = new Set(data.tyres.map(tyre => tyreNoKey(tyre.tyreNo)));
    const duplicates = numbers.filter(number => taken.has(tyreNoKey(number)));
    if (duplicates.length) return toast(`Reifen-Nr. ${duplicates.join(', ')} ist schon vergeben. Bitte eine andere Nummer eingeben.`);
    const now = Date.now();
    numbers.forEach((number, i) => data.tyres.push({ id: now + i, mfr: tyreFormMfr, articleNo: model.articleNo || '—', name: model.name, surface: model.surface, tyreNo: number, runs: 0, history: [], forRace: false, addedAt: new Date().toISOString() }));
    save(); tyreFormOpen = false; tyreFormMfr = ''; tyreFormAddingMfr = false; tyreFormAddingModel = false; tyreFormEditingMfr = null; tyreFormEditingModel = null; tyreFormModelIdx = null; render();
    toast(count === 1 ? `Reifensatz #${numbers[0]} hinzugefügt.` : `${count} Reifensätze hinzugefügt (#${numbers.join(', #')}).`);
  };

  document.querySelectorAll('[data-tyre-race]').forEach(el => el.onchange = () => { data.tyres[Number(el.dataset.tyreRace)].forRace = el.checked; save(); render(); });
  document.querySelectorAll('[data-tyre-edge]').forEach(el => el.onchange = () => { data.tyres[Number(el.dataset.tyreEdge)].edge = el.checked; save(); });
  document.querySelectorAll('[data-tyre-no]').forEach(el => el.onchange = () => {
    const tyre = data.tyres[Number(el.dataset.tyreNo)];
    const value = el.value.trim();
    if (!value) { el.value = tyre.tyreNo; return toast('Jeder Reifensatz braucht eine Reifen-Nr.'); }
    if (data.tyres.some(other => other !== tyre && tyreNoKey(other.tyreNo) === tyreNoKey(value))) { el.value = tyre.tyreNo; return toast(`Reifen-Nr. ${value} ist schon vergeben.`); }
    tyre.tyreNo = value; save();
  });
  const settingNumber = (selector, key, max) => { const input = document.querySelector(selector); if (input) input.onchange = () => { data.tyreSettings[key] = Math.max(0, Math.min(max, parseInt(input.value, 10) || 0)); save(); render(); }; };
  settingNumber('#tyre-class-limit', 'classLimit', 20);
  settingNumber('#tyre-wear-runs', 'wearRuns', 200);
  const raceSurface = document.querySelector('#tyre-race-surface');
  if (raceSurface) raceSurface.onchange = () => { if (!data.renntag) return toast('Bitte zuerst einen Renntag anlegen.'); data.renntag.surface = raceSurface.value; save(); render(); };
  document.querySelectorAll('[data-tyre-delete]').forEach(btn => btn.onclick = () => {
    if (!window.confirm(`„${data.tyres[Number(btn.dataset.tyreDelete)].name}" wirklich löschen?`)) return;
    data.tyres.splice(Number(btn.dataset.tyreDelete), 1); save(); render();
  });
  bind();
}
// Speichert ein Laufergebnis beim Lauf aus der PDF-Kopfzeile; ohne passenden Zeitplan-Lauf beim gewaehlten Lauf (fallbackKey)
function storeAnalysisResult(result, fileName, fallbackKey) {
  result.drivers.forEach(driver => { driver.name = correctedName(driver.name); });
  const pdfKey = result.recognized ? analysisKey(result) : null;
  const targetKey = pdfKey && data.schedule.some(entry => analysisKey(entry) === pdfKey) ? pdfKey : fallbackKey;
  if (!targetKey) return null;
  data.analysisImports[targetKey] = { fileName, importedAt: new Date().toISOString() };
  data.analysisResults[targetKey] = result;
  data.analysisSelections[targetKey] = result.drivers.map((driver, index) => index).filter(index => result.drivers[index].laps.length);
  return targetKey;
}
// Automatischer Ergebnis-Import: ueberwacht einen freigegebenen Ordner (File System Access API, nur Edge/Chrome am PC).
// Der Ordner-Zugriff wird in IndexedDB gemerkt; nach dem Neuladen muss er per Klick bestaetigt werden.
const folderWatchSupported = typeof window.showDirectoryPicker === 'function';
let watchFolder = null;
let watchTimer = null;
let watchScanning = false;
let watchLastScan = null;
let watchNeedsPermission = false;
function folderHandleStore(handle) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('mg-race-manager', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const store = request.result.transaction('handles', handle ? 'readwrite' : 'readonly').objectStore('handles');
      const operation = handle ? store.put(handle, 'resultFolder') : store.get('resultFolder');
      operation.onsuccess = () => resolve(operation.result);
      operation.onerror = () => reject(operation.error);
    };
  });
}
function watchStatusText() {
  if (!watchFolder) return 'Kein Ordner ausgewählt';
  if (watchNeedsPermission) return `Ordner „${data.autoImport.folderName}“ · Zugriff muss bestätigt werden`;
  if (!watchTimer) return `Ordner „${data.autoImport.folderName}“ · pausiert`;
  return `Überwacht „${data.autoImport.folderName}“ · alle ${data.autoImport.intervalSeconds} s · ${watchScanning ? 'prüft gerade …' : `letzte Prüfung ${watchLastScan ? watchLastScan.toLocaleTimeString('de-DE') : '–'}`}`;
}
function updateWatchStatus() {
  const status = document.querySelector('[data-watch-status]');
  if (status) status.textContent = watchStatusText();
}
function addWatchLog(file, text, ok) {
  data.autoImport.log = [{ at: new Date().toISOString(), file, text, ok }, ...data.autoImport.log].slice(0, 15);
}
function startWatching() {
  clearInterval(watchTimer);
  watchTimer = setInterval(scanWatchFolder, data.autoImport.intervalSeconds * 1000);
  scanWatchFolder();
}
function stopWatching() {
  clearInterval(watchTimer);
  watchTimer = null;
}
async function chooseWatchFolder() {
  try {
    const handle = await window.showDirectoryPicker({ id: 'mg-results', mode: 'read' });
    if (data.autoImport.folderName !== handle.name) data.autoImport.seen = {};
    watchFolder = handle;
    watchNeedsPermission = false;
    data.autoImport.folderName = handle.name;
    data.autoImport.enabled = true;
    save();
    try { await folderHandleStore(handle); } catch (error) { /* ohne IndexedDB muss der Ordner nach dem Neuladen neu gewaehlt werden */ }
    startWatching();
    render();
  } catch (error) {
    if (error.name !== 'AbortError') toast(`Ordner konnte nicht geöffnet werden: ${errorText(error)}`);
  }
}
async function resumeWatching() {
  if (!watchFolder) return chooseWatchFolder();
  try {
    if (await watchFolder.requestPermission({ mode: 'read' }) !== 'granted') return toast('Kein Zugriff auf den Ordner erlaubt.');
  } catch (error) { return toast(`Ordner-Zugriff fehlgeschlagen: ${errorText(error)}`); }
  watchNeedsPermission = false;
  data.autoImport.enabled = true;
  save();
  startWatching();
  render();
}
function pauseWatching() {
  stopWatching();
  data.autoImport.enabled = false;
  save();
  render();
}
// Liest neue oder geaenderte PDFs und importiert Laufergebnisse, die zu einem Lauf im Zeitplan passen.
// Passt ein Ergebnis (noch) nicht zum Zeitplan, wird es nach dem naechsten Zeitplan-Import erneut geprueft.
async function scanWatchFolder() {
  if (!watchFolder || watchScanning) return;
  watchScanning = true;
  updateWatchStatus();
  const imported = [];
  try {
    for await (const handle of watchFolder.values()) {
      if (handle.kind !== 'file' || !/\.pdf$/i.test(handle.name)) continue;
      const file = await handle.getFile();
      const stamp = `${file.lastModified}|${file.size}`;
      const scheduleStamp = `${stamp}|zeitplan${data.schedule.length}`;
      if ([stamp, scheduleStamp].includes(data.autoImport.seen[handle.name])) continue;
      try {
        const result = parseLapAnalysis(await extractPdfText(file));
        if (!result.recognized || !result.drivers.length) {
          data.autoImport.seen[handle.name] = stamp;
          addWatchLog(handle.name, 'Kein Laufergebnis, übersprungen', false);
        } else if (!data.schedule.some(entry => analysisKey(entry) === analysisKey(result))) {
          data.autoImport.seen[handle.name] = scheduleStamp;
          addWatchLog(handle.name, `${analysisLabel(result)} steht nicht im Zeitplan, übersprungen`, false);
        } else {
          const replaced = Boolean(data.analysisResults[analysisKey(result)]);
          storeAnalysisResult(result, handle.name, null);
          data.autoImport.seen[handle.name] = stamp;
          addWatchLog(handle.name, `${replaced ? 'Ersetzt' : 'Importiert'}: ${analysisLabel(result)}`, true);
          imported.push(result);
        }
      } catch (error) {
        data.autoImport.seen[handle.name] = stamp;
        addWatchLog(handle.name, `Fehler: ${errorText(error)}`, false);
      }
    }
  } catch (error) {
    stopWatching();
    watchNeedsPermission = true;
    addWatchLog('', `Ordner nicht lesbar: ${errorText(error)}`, false);
  }
  watchLastScan = new Date();
  watchScanning = false;
  save();
  if (imported.length) {
    toast(imported.length === 1 ? `Automatisch importiert: ${analysisLabel(imported[0])}` : `${imported.length} Ergebnisse automatisch importiert.`);
    checkImportedNames(imported.flatMap(result => result.drivers.map(driver => driver.name)));
  }
  if (view.startsWith('analysis') && (imported.length || watchNeedsPermission)) render(); else updateWatchStatus();
}
async function initFolderWatch() {
  if (!folderWatchSupported || !data.autoImport.enabled) return;
  try { watchFolder = await folderHandleStore(); } catch (error) { watchFolder = null; }
  if (!watchFolder) return;
  if (await watchFolder.queryPermission({ mode: 'read' }) === 'granted') return startWatching();
  watchNeedsPermission = true;
  toast('Automatischer Import pausiert: Ordner-Zugriff in der Renn-Analyse bestätigen.');
  if (view.startsWith('analysis')) render();
}
function autoImportPanel() {
  if (!folderWatchSupported) return '<section class="panel auto-import-panel"><h2 class="panel-title">Automatischer Import</h2><p class="auto-import-note">Dein Browser unterstützt keine Ordnerüberwachung. Nutze Microsoft Edge oder Google Chrome am PC.</p></section>';
  const running = Boolean(watchTimer);
  const actions = !watchFolder ? '<button type="button" class="secondary-button" data-watch="choose">Ordner auswählen</button>'
    : `${running ? '<button type="button" class="text-button" data-watch="scan">Jetzt prüfen</button><button type="button" class="text-button" data-watch="pause">Pausieren</button>' : `<button type="button" class="secondary-button" data-watch="resume">${watchNeedsPermission ? 'Überwachung fortsetzen' : 'Fortsetzen'}</button>`}<button type="button" class="text-button" data-watch="choose">Ordner ändern</button>`;
  const intervals = [15, 30, 60, 120].map(seconds => `<option value="${seconds}" ${data.autoImport.intervalSeconds === seconds ? 'selected' : ''}>alle ${seconds} s</option>`).join('');
  const log = data.autoImport.log.slice(0, 6).map(entry => `<li class="${entry.ok ? 'ok' : ''}"><time>${new Date(entry.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</time><span>${entry.file ? `<b>${entry.file}</b> · ` : ''}${entry.text}</span></li>`).join('');
  return `<section class="panel auto-import-panel"><div class="auto-import-head"><div><h2 class="panel-title">Automatischer Import</h2><p class="auto-import-note">${watchFolder ? '' : 'Wähle den Ordner, in dem die Zeitnahme die Ergebnis-PDFs ablegt. Neue Laufergebnisse werden automatisch dem passenden Lauf zugeordnet. '}<span data-watch-status>${watchStatusText()}</span></p></div><div class="auto-import-actions">${actions}<select data-watch-interval aria-label="Prüfintervall">${intervals}</select></div></div>${log ? `<ul class="auto-import-log">${log}</ul>` : ''}</section>`;
}
function bindAutoImportPanel() {
  document.querySelectorAll('[data-watch]').forEach(button => button.onclick = () => ({ choose: chooseWatchFolder, resume: resumeWatching, pause: pauseWatching, scan: scanWatchFolder }[button.dataset.watch])());
  const interval = document.querySelector('[data-watch-interval]');
  if (interval) interval.onchange = () => { data.autoImport.intervalSeconds = Number(interval.value); save(); if (watchTimer) startWatching(); updateWatchStatus(); };
}
function analysisKey(run) { return `${run.cls}|${run.group}|${run.raceType.toLocaleLowerCase('de-DE')}|${run.raceNumber}`; }
const analysisLabel = run => `${run.cls} · ${groupLabel(run.group)} · ${scheduleLabel(run)}`;
function analysisPage() {
  const selectedDrivers = data.drivers.filter(driver => data.dashboardDrivers.map(String).includes(String(driver.id || driver.number)));
  const classes = [...new Set(selectedDrivers.flatMap(driver => driver.classes || [driver.cls]))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'de-DE'));
  const activeKey = view.startsWith('analysis-') ? view.replace('analysis-', '') : null;
  const result = activeKey ? data.analysisResults[activeKey] : null;
  const selection = activeKey ? (data.analysisSelections[activeKey] || []) : [];
  const importRow = (key, label, detail) => `<div class="analysis-import-row"><div><strong>${label}</strong><small>${detail} · ${data.analysisImports[key]?.fileName || 'Noch keine Datei ausgewählt'}</small></div><div class="analysis-actions"><button class="secondary-button" data-analysis-import="${key}">PDF auswählen</button>${data.analysisResults[key] ? `<button class="analysis-button" data-analysis-view="${key}">Analyse</button>` : ''}</div></div>`;
  // Eine aufklappbare Gruppe je Zeitplan-Gruppe; Gruppen mit eigenen Fahrern sind geoeffnet
  const groupSection = (cls, group, runs) => {
    const members = selectedDrivers.filter(driver => driverMemberships(driver).some(membership => membership.cls === cls && membership.group === group));
    const imported = runs.filter(run => data.analysisResults[analysisKey(run)]).length;
    return `<details class="analysis-group"${members.length ? ' open' : ''}><summary><strong>${groupLabel(group)}</strong>${members.length ? `<span class="analysis-group-drivers">${members.map(driver => driver.name).join(' · ')}</span>` : ''}<span class="analysis-group-count">${imported} / ${runs.length} importiert</span></summary><div class="analysis-list">${runs.map(run => importRow(analysisKey(run), scheduleLabel(run), `Start ${run.start} Uhr`)).join('')}</div></details>`;
  };
  const groupsOf = runs => {
    const groups = new Map();
    runs.sort((a, b) => String(a.group).localeCompare(String(b.group), 'de-DE', { numeric: true }) || Number(a.raceNumber) - Number(b.raceNumber)).forEach(run => { if (!groups.has(run.group)) groups.set(run.group, []); groups.get(run.group).push(run); });
    return [...groups];
  };
  const classSection = cls => {
    const runs = data.schedule.filter(entry => entry.cls === cls);
    const heats = groupsOf(runs.filter(run => !isFinalRun(run)));
    const finals = groupsOf(runs.filter(isFinalRun));
    const block = (label, groups) => groups.length ? `<p class="analysis-class-label">${label}</p>${groups.map(([group, groupRuns]) => groupSection(cls, group, groupRuns)).join('')}` : '';
    return `<section class="panel analysis-panel"><h2 class="panel-title">${cls}</h2>${block('Vorläufe', heats)}${block('Finalläufe', finals)}${runs.length ? '' : '<p class="empty-state">Für diese Rennklasse ist noch kein Zeitplan importiert. Die Gruppen werden aus dem Zeitplan übernommen.</p>'}</section>`;
  };
  const chartSection = result ? `<section class="panel analysis-chart-panel"><div class="panel-head"><div><h2 class="panel-title">${result.cls} · ${groupLabel(result.group)}</h2><span class="panel-note">${result.raceType} ${result.raceNumber}</span></div><button class="text-button" data-view="analysis">Zurück zu den Importen</button></div>${analysisStarters(result, selection)}${analysisGraph(result)}</section>` : '';
  const emptyState = !selectedDrivers.length ? '<p class="empty-state">Noch keine Fahrer im Dashboard ausgewählt. Wähle zuerst bis zu drei Fahrer aus.</p>' : '';
  app.innerHTML = `<div class="eyebrow">${data.renntag.name}</div><h1 class="page-title">Renn-Analyse</h1><p class="page-intro">Pro Rennklasse deiner Dashboard-Fahrer findest du alle Gruppen und Läufe aus dem Zeitplan. Importiere je Lauf das Ergebnis-PDF und vergleiche die Rundenzeiten.</p>${chartSection || autoImportPanel()}${emptyState}${classes.map(classSection).join('')}`;
  bind();
  bindAutoImportPanel();
  document.querySelectorAll('[data-analysis-view]').forEach(button => button.onclick = () => { view = `analysis-${button.dataset.analysisView}`; render(); });
  document.querySelectorAll('[data-analysis-driver]').forEach(input => input.onchange = () => { data.analysisSelections[activeKey] = [...document.querySelectorAll('[data-analysis-driver]:checked')].map(item => Number(item.dataset.analysisDriver)); save(); render(); });
  document.querySelectorAll('[data-analysis-select]').forEach(button => button.onclick = () => {
    const own = analysisOwnNames();
    data.analysisSelections[activeKey] = result.drivers.map((driver, index) => index).filter(index => result.drivers[index].laps.length && (button.dataset.analysisSelect === 'all' || own.includes(result.drivers[index].name.toLocaleLowerCase('de-DE'))));
    save();
    render();
  });
}
function analysisOwnNames() {
  return data.drivers.filter(driver => data.dashboardDrivers.map(String).includes(String(driver.id || driver.number))).map(driver => driver.name.toLocaleLowerCase('de-DE'));
}
// Alle Starter der Gruppe mit Ergebnisdaten; abgewaehlte Fahrer erscheinen nicht im Diagramm
function analysisStarters(result, selection) {
  const own = analysisOwnNames();
  const time = value => value ? value.toFixed(3) : '–';
  const rows = result.drivers.map((driver, index) => {
    const hasLaps = driver.laps.length > 0;
    const active = hasLaps && selection.includes(index);
    const mine = own.includes(driver.name.toLocaleLowerCase('de-DE'));
    return `<tr class="${active ? '' : 'is-off'}${mine ? ' is-mine' : ''}"><td><label class="analysis-toggle"><input type="checkbox" data-analysis-driver="${index}" ${active ? 'checked' : ''} ${hasLaps ? '' : 'disabled'} aria-label="${driver.name} im Vergleich anzeigen"><span class="analysis-swatch" style="--driver-color:${analysisColors[index % analysisColors.length]}"></span></label></td><td>${driver.pos ?? index + 1}</td><td class="analysis-starter-name">${driver.name}${mine ? '<span class="analysis-tag mine">Mein Fahrer</span>' : ''}${driver.status ? `<span class="analysis-tag">${driver.status}</span>` : ''}</td><td>${driver.lapCount ?? driver.laps.length}</td><td>${driver.total || '–'}</td><td>${time(driver.best)}</td><td>${time(driver.avg)}</td></tr>`;
  }).join('');
  const activeCount = selection.filter(index => result.drivers[index]?.laps.length).length;
  return `<div class="analysis-starters"><div class="analysis-starters-head"><strong>Starter der Gruppe <span>${activeCount} von ${result.drivers.length} im Vergleich</span></strong><div class="analysis-starters-actions"><button type="button" class="text-button" data-analysis-select="all">Alle anzeigen</button><button type="button" class="text-button" data-analysis-select="mine">Nur meine Fahrer</button></div></div><div class="analysis-starters-scroll"><table class="analysis-starters-table"><thead><tr><th><span class="sr-only">Im Vergleich</span></th><th>Pos</th><th>Fahrer</th><th>Rnd</th><th>Gesamtzeit</th><th>Bestzeit</th><th>Ø Runde</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
const analysisColors = ['#0e6568', '#e26d3d', '#71843b', '#8a5fa8', '#cf9b2b', '#2f7fb0', '#c2456b', '#5b6b70', '#1f9e89', '#9c6b3f'];
// Runde 1 ist beim Gruppenstart nur der Weg bis zur Ziellinie; deutlich zu kurze Startrunden zaehlen nicht
function chartLaps(laps) {
  const sorted = [...laps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  return laps.map((value, index) => ({ lap: index + 1, value })).filter((item, index) => !(index === 0 && laps.length > 1 && item.value < median * 0.6));
}
function analysisGraph(result) {
  const key = view.replace('analysis-', '');
  const selected = data.analysisSelections[key] || [];
  const own = analysisOwnNames();
  const entries = result.drivers.map((driver, index) => ({ driver, index, color: analysisColors[index % analysisColors.length], mine: own.includes(driver.name.toLocaleLowerCase('de-DE')), points: chartLaps(driver.laps) })).filter(entry => selected.includes(entry.index) && entry.points.length);
  if (!entries.length) return '<div class="analysis-empty">Wähle mindestens einen Fahrer aus, um den Rundenzeitvergleich anzuzeigen.</div>';
  entries.forEach(entry => { entry.best = entry.points.reduce((best, point) => point.value < best.value ? point : best); });
  const width = 760; const height = 330; const pad = { left: 52, right: 20, top: 30, bottom: 42 };
  const maxLaps = Math.max(...entries.map(entry => entry.driver.laps.length), 1); const values = entries.flatMap(entry => entry.points.map(point => point.value)); const min = Math.max(0, Math.floor(Math.min(...values) * 2) / 2 - 0.5); const top = Math.max(min + 1, Math.max(...values)); const tickStep = top - min > 6 ? 1 : 0.5; const max = min + Math.ceil((top - min) / tickStep) * tickStep;
  const x = lap => pad.left + ((lap - 1) / Math.max(maxLaps - 1, 1)) * (width - pad.left - pad.right); const y = value => height - pad.bottom - ((value - min) / Math.max(max - min, 1)) * (height - pad.top - pad.bottom);
  const ticks = Array.from({ length: Math.floor((max - min) / tickStep) + 1 }, (_, index) => Number((min + index * tickStep).toFixed(2))); if (ticks[ticks.length - 1] !== max) ticks.push(max);
  const grid = ticks.map(value => `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(value)}" y2="${y(value)}" class="chart-grid"/><text x="8" y="${y(value) + 4}" class="chart-label">${value.toFixed(2)} s</text>`).join('');
  // Eigene Fahrer zuletzt zeichnen, damit sie oben liegen
  const lines = [...entries].sort((a, b) => a.mine - b.mine).map(({ color, mine, points, best }) => { const bx = x(best.lap); const by = y(best.value); return `<polyline points="${points.map(point => `${x(point.lap)},${y(point.value)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${mine ? 3.5 : 2}" opacity="${mine ? 1 : 0.75}"/><line x1="${bx}" y1="${by}" x2="${bx}" y2="${height - pad.bottom}" stroke="${color}" stroke-width="1" stroke-dasharray="4 3" opacity="0.3"/><circle cx="${bx}" cy="${by}" r="8" fill="#fff" stroke="${color}" stroke-width="2.5"/><text x="${bx}" y="${by + 4}" text-anchor="middle" font-size="9" font-weight="800" fill="${color}">★</text>`; }).join('');
  const xLabels = Array.from({ length: maxLaps }, (_, index) => index + 1).filter(lap => lap === 1 || lap === maxLaps || lap % 5 === 0).map(lap => `<text x="${x(lap)}" y="${height - 12}" class="chart-label" text-anchor="middle">${lap}</text>`).join('');
  const bestLegend = entries.map(({ driver, color, mine, best }) => `<div class="best-lap-entry${mine ? ' is-mine' : ''}"><span class="best-lap-swatch" style="background:${color}">★</span><span class="best-lap-name">${driver.name}</span><span class="best-lap-time">${best.value.toFixed(3)} s</span><span class="best-lap-round">Runde ${best.lap}</span></div>`).join('');
  return `<div class="analysis-chart-wrap"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Rundenzeitvergleich">${grid}<line x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${height - pad.bottom}" class="chart-axis"/><line x1="${pad.left}" x2="${width - pad.right}" y1="${height - pad.bottom}" y2="${height - pad.bottom}" class="chart-axis"/>${lines}${xLabels}<text x="${width / 2}" y="${height - 1}" class="chart-label" text-anchor="middle">Runde</text><text x="14" y="18" class="chart-label">Rundenzeit</text></svg></div><div class="best-laps-legend"><span class="best-laps-title">★ Bestzeiten</span>${bestLegend}</div>`;
}
function dashboard() {
  const selected = data.drivers.filter(driver => data.dashboardDrivers.map(String).includes(String(driver.id || driver.number)));
  const next = data.races.find(race => race.status !== 'done');
  const driverCards = selected.length ? selected.map(driver => `<div class="driver-row dashboard-driver"><div class="driver-details-row"><span class="avatar">${initials(driver.name)}</span><span class="driver-details"><strong>${driver.name}${String(driver.id || driver.number) === String(data.myDriverId) ? ' <span class="me-badge">Ich</span>' : ''}</strong><small>${(driver.classes || [driver.cls]).length} Rennklasse${(driver.classes || [driver.cls]).length === 1 ? '' : 'n'}</small></span></div><div class="driver-qualifications">${driverQualificationMarkup(driver)}</div></div>`).join('') : '<p class="empty-state">Noch keine Fahrer ausgewählt.</p>';
  const uniqueClasses = [...new Set(selected.flatMap(d => d.classes || [d.cls]))];
  const showPerDriver = selected.length > 1 && uniqueClasses.length > 1;
  let summaryHtml;
  if (showPerDriver) {
    summaryHtml = selected.map(driver => {
      const runs = driverSchedule(driver);
      const nextRun = runs.find(r => scheduleState(r).className !== 'finished') || null;
      const state = nextRun ? scheduleState(nextRun) : null;
      const warning = nextRun ? warningForRun(nextRun) : null;
      if (nextRun && warning) triggerWarning(nextRun, warning);
      const wKey = nextRun && warning ? `${scheduleKey(nextRun)}|${warning.type}` : '';
      const visWarn = warning && !dismissedWarnings.has(wKey) ? warning : null;
      const shift = nextRun ? `<div class="tile-shifts"><button type="button" data-shift-run="${scheduleKey(nextRun)}" data-shift-minutes="-5">− 5 Min</button><button type="button" data-shift-run="${scheduleKey(nextRun)}" data-shift-minutes="-1">− 1 Min</button><button type="button" data-shift-run="${scheduleKey(nextRun)}" data-shift-minutes="1">+ 1 Min</button><button type="button" data-shift-run="${scheduleKey(nextRun)}" data-shift-minutes="5">+ 5 Min</button></div>` : '';
      const warnBlock = visWarn ? `<div class="tile-warn-overlay" role="alertdialog"><span class="warning-kicker">ACHTUNG</span><strong>${visWarn.text}</strong><button type="button" data-dismiss-warning="${wKey}">Bestätigen · Enter</button></div>` : '';
      return `<div class="driver-countdown-tile${visWarn ? ` warning-active ${visWarn.className}` : ''}"><div class="tile-head"><span class="avatar">${initials(driver.name)}</span><div class="tile-meta"><strong class="tile-name">${driver.name}</strong><small class="tile-class">${nextRun ? `${nextRun.cls} · ${isFinalGroup(nextRun.group) ? nextRun.group : `Gr. ${nextRun.group}`} · ${scheduleLabel(nextRun)}` : (driver.classes || [driver.cls]).join(', ')}</small></div></div><div class="tile-body"><strong class="tile-countdown">${state?.label || '–'}</strong><span class="tile-start">${nextRun ? `Start ${nextRun.start} Uhr` : runs.length ? 'Alle Läufe beendet' : 'Kein Zeitplan'}</span>${shift}${nextRun ? '' : phaseHintMarkup(finalPhaseHint([driver]))}</div>${warnBlock}</div>`;
    }).join('');
  } else {
    const nextDriver = nextDriverRun(selected);
    const nextSchedule = nextDriver?.run;
    const nextRunState = nextSchedule ? scheduleState(nextSchedule) : null;
    const nextWarning = nextSchedule ? warningForRun(nextSchedule) : null;
    if (nextSchedule && nextWarning) triggerWarning(nextSchedule, nextWarning);
    const nextRunTime = nextSchedule?.start || (data.schedule.length ? '--:--' : next?.time) || '--:--';
    const warningKey = nextSchedule && nextWarning ? `${scheduleKey(nextSchedule)}|${nextWarning.type}` : '';
    const visibleWarning = nextWarning && !dismissedWarnings.has(warningKey) ? nextWarning : null;
    const phaseHint = nextDriver ? null : finalPhaseHint(selected);
    const finishedAll = !nextDriver && selected.some(driver => driverSchedule(driver).length);
    const nextRunDetails = nextDriver ? `${nextDriver.driver.name} · ${nextSchedule.cls} · ${groupLabel(nextSchedule.group)} · ${scheduleLabel(nextSchedule)}` : !selected.length ? 'Fahrer auswählen' : finishedAll ? 'Alle Läufe beendet' : 'Kein passender Zeitplan für die ausgewählten Fahrer';
    const shiftButtons = nextSchedule ? `<div class="run-adjustments"><button type="button" data-shift-run="${scheduleKey(nextSchedule)}" data-shift-minutes="-5">- 5 Min</button><button type="button" data-shift-run="${scheduleKey(nextSchedule)}" data-shift-minutes="-1">- 60 Sek</button><button type="button" data-shift-run="${scheduleKey(nextSchedule)}" data-shift-minutes="1">+ 60 Sek</button><button type="button" data-shift-run="${scheduleKey(nextSchedule)}" data-shift-minutes="5">+ 5 Min</button></div>` : '';
    const warningOverlay = visibleWarning ? `<div class="warning-overlay" role="alertdialog" aria-modal="true" aria-label="${visibleWarning.text}"><span class="warning-kicker">ACHTUNG</span><strong>${visibleWarning.text}</strong><span class="warning-help">Vorbereitung für ${nextSchedule.start} Uhr</span><button type="button" data-dismiss-warning="${warningKey}">Bestätigen · Enter</button></div>` : '';
    summaryHtml = `<div class="countdown-stat ${visibleWarning ? `warning-active ${visibleWarning.className}` : ''}"><span class="stat-label">Nächster Lauf</span><div class="countdown-line"><strong class="countdown-time">${nextRunState?.label || 'Kein Countdown'}</strong><span class="next-start-time">Start ${nextRunTime} Uhr</span></div><div class="next-run-details">${nextRunDetails}</div>${phaseHintMarkup(phaseHint)}${warningOverlay}${shiftButtons}</div><div class="compact-stat"><span>Aktuelle Uhrzeit</span><strong>${currentRaceTime()}</strong><small>${data.clock.testMode ? 'Test' : 'Rechner'}</small></div><div class="compact-stat"><span>Im Dashboard</span><strong>${selected.length} / 3</strong><small>Fahrer aktiv</small></div>`;
  }
  const eventDetails = [data.renntag.place, data.renntag.organizer].filter(Boolean).join(' · ');
  app.innerHTML = `<div class="eyebrow">${data.renntag.name} · ${data.renntag.date}</div><div class="hero-row"><div><h1 class="page-title">Renntag im Blick.</h1><p class="page-intro">Deine ausgewählten Fahrer und der aktuelle Rennfortschritt.</p></div><div class="section-actions"><span class="event-state"><i></i> Renntag aktiv</span><button class="secondary-button" data-view="edit">Renntag bearbeiten</button></div></div><div class="dashboard-summary${showPerDriver ? ' dashboard-summary--per-driver' : ''}">${summaryHtml}</div>${weatherWidget()}<section class="panel drivers-panel"><div class="panel-head"><h2 class="panel-title">Meine Fahrer</h2><button data-view="fahrer">Fahrer auswählen</button></div>${data.tyres.length && !myDriver() ? '<p class="tyre-pick-hint">Um Reifen einem Lauf zuzuordnen, lege unter <button type="button" class="tyre-pick-link" data-view="fahrer">Fahrer</button> fest, welcher Fahrer du bist.</p>' : ''}${driverCards}</section>`;
  bind();
  document.querySelectorAll('[data-pick-tyre]').forEach(button => button.onclick = () => selectTyreForRun(button.dataset.pickRun, Number(button.dataset.pickTyre), button.dataset.pickClass));
}
function driversPage() {
  app.innerHTML = `<div class="eyebrow">${data.renntag.name}</div><h1 class="page-title">Fahrer auswählen.</h1><p class="page-intro">Aktiviere maximal drei Fahrer. Sie erscheinen anschließend vorne im Dashboard.</p><section class="panel me-panel"><div class="panel-head"><div><h2 class="panel-title">Das bin ich</h2><p class="settings-copy">Nur bei diesem Fahrer kannst du im Dashboard die eingesetzten Reifen wählen.</p></div></div><select id="my-driver"><option value="">— nicht festgelegt —</option>${[...data.drivers].sort((a, b) => a.name.localeCompare(b.name, 'de-DE')).map(driver => { const id = driver.id || String(driver.number); return `<option value="${id}" ${String(id) === String(data.myDriverId) ? 'selected' : ''}>${driver.name}</option>`; }).join('')}</select></section><section class="panel"><div class="panel-head"><h2 class="panel-title">Importierte Fahrer</h2><span class="selection-count">${data.dashboardDrivers.length} / 3 aktiv</span></div>${data.drivers.map(driver => { const id = driver.id || String(driver.number); const active = data.dashboardDrivers.map(String).includes(id); return `<button class="driver-select ${active ? 'selected' : ''}" data-driver="${id}"><span class="avatar">${initials(driver.name)}</span><span><strong>${driver.name}</strong></span><span class="check">${active ? '✓' : '+'}</span></button>`; }).join('')}</section>`;
  document.querySelector('#my-driver').onchange = event => {
    data.myDriverId = event.target.value || null;
    const driver = myDriver();
    if (driver && !data.dashboardDrivers.map(String).includes(String(data.myDriverId)) && data.dashboardDrivers.length < 3) data.dashboardDrivers.push(data.myDriverId);
    save(); render();
    toast(driver ? `${driver.name} ist als dein Fahrer festgelegt.` : 'Kein eigener Fahrer festgelegt.');
  };
  bind();
}
function toggleDriver(id) { const active = data.dashboardDrivers.map(String).includes(String(id)); if (active) data.dashboardDrivers = data.dashboardDrivers.filter(item => String(item) !== String(id)); else if (data.dashboardDrivers.length < 3) data.dashboardDrivers.push(id); else return toast('Maximal drei Fahrer können aktiviert werden.'); save(); render(); }
function schedule() { const rows = data.schedule.map(entry => `<div class="race-row"><div class="race-time">${entry.start}</div><div><div class="race-name">${entry.cls} · ${groupLabel(entry.group)}</div><span class="race-meta">${entry.raceType} ${entry.raceNumber} · Ende ${entry.end} Uhr</span></div><span class="status">Geplant</span></div>`).join(''); app.innerHTML = `<div class="eyebrow">${data.renntag.name}</div><h1 class="page-title">Laufstatus</h1><p class="page-intro">Rennklasse, Gruppe, Lauf sowie Start- und Endzeit aus dem importierten Zeitplan.</p><section class="panel"><div class="panel-head"><h2 class="panel-title">Importierter Zeitplan</h2><span class="panel-note">${data.schedule.length} Einträge</span></div>${rows || '<p class="empty-state">Noch kein Zeitplan importiert.</p>'}</section>`; bind(); }
function editPage() {
  app.innerHTML = `<div class="eyebrow">Renntag bearbeiten</div><h1 class="page-title">Renntag frei<br>bearbeiten.</h1><p class="page-intro">Ändere Name, Datum und Veranstaltungsort jederzeit. Die Daten werden lokal gespeichert.</p><section class="panel edit-form"><label>Renntag / Veranstaltung<input id="race-name" value="${data.renntag.name}"></label><label>Datum<input id="race-date" value="${data.renntag.date}"></label><label>Veranstaltungsort<input id="race-place" value="${data.renntag.place || ''}" placeholder="z. B. Ems-Ring, Rheda-Wiedenbrück"></label><label>Veranstalter<input id="race-organizer" value="${data.renntag.organizer || ''}" placeholder="z. B. MCC Rheda-Wiedenbrück"></label><div><button class="primary-button" data-action="save-race">Änderungen speichern</button><button class="text-button" data-view="dashboard">Abbrechen</button></div></section>`;
  document.querySelector('[data-action="save-race"]').onclick = () => { data.renntag.name = document.querySelector('#race-name').value.trim() || 'Neuer Renntag'; data.renntag.date = document.querySelector('#race-date').value.trim() || 'Datum offen'; data.renntag.place = document.querySelector('#race-place').value.trim(); data.renntag.organizer = document.querySelector('#race-organizer').value.trim(); save(); updateActiveEvent(); view = 'dashboard'; render(); toast('Renntag wurde gespeichert.'); };
  bind();
}
function render() { const analysisView = view.startsWith('analysis-'); ({ start: startPage, import: importPage, dashboard, fahrer: driversPage, zeitplan: schedule, edit: editPage, settings: settingsPage, analysis: analysisPage, reifen: tyrePage }[analysisView ? 'analysis' : view] || startPage)(); updateActiveEvent(); }
document.querySelector('#file-input').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const type = event.target.dataset.importType || 'vorlauf';
  const analysisImport = event.target.dataset.analysisImport;
  try {
    toast('PDF wird gelesen ...');
    const text = await extractPdfText(file);
    if (analysisImport) {
      const analysisResult = parseLapAnalysis(text);
      if (!analysisResult.drivers.length) throw new Error('Keine Rundenzeiten erkannt.');
      const targetKey = storeAnalysisResult(analysisResult, file.name, analysisImport);
      save();
      view = 'analysis';
      render();
      checkImportedNames(analysisResult.drivers.map(driver => driver.name));
      toast(targetKey === analysisImport ? `${file.name} gespeichert.` : `${file.name} gehört zu ${analysisLabel(analysisResult)} und wurde dort gespeichert.`);
      event.target.value = '';
      delete event.target.dataset.analysisImport;
      return;
    }
    let importedCount = 0;
    if (type === 'zeitplan') {
      const imported = parseSchedule(text);
      if (!imported.length) throw new Error('Keine Zeitplan-Einträge erkannt.');
      const schedule = mergeSchedule(data.schedule, imported);
      data.schedule = schedule;
      data.races = schedule.map(entry => ({ time: entry.start, name: `${entry.cls} - ${entry.group}`, meta: `${entry.raceType} ${entry.raceNumber} · Ende ${entry.end}`, status: 'next' }));
      data.imports.zeitplan = { fileName: file.name, importedAt: new Date().toISOString(), count: schedule.length };
    } else {
      const drivers = parseDrivers(text).map(driver => ({ ...driver, name: correctedName(driver.name) }));
      if (!drivers.length) throw new Error('Keine Fahrergruppen erkannt.');
      data.drivers = mergeImportedDrivers(data.drivers, drivers);
      data.dashboardDrivers = data.dashboardDrivers.filter(id => data.drivers.some(driver => String(driver.id || driver.number) === String(id))).slice(0, 3);
      data.imports[type] = { fileName: file.name, importedAt: new Date().toISOString(), count: drivers.length };
      importedCount = drivers.length;
    }
    data.importiert = true;
    save();
    if (view !== 'dashboard') view = 'import';
    render();
    if (type !== 'zeitplan') checkImportedNames(data.drivers.map(driver => driver.name));
    toast(type === 'zeitplan' ? `Zeitplan aus ${file.name} importiert (${scheduleSummary(data.schedule)}).` : `${importedCount} Fahrer aus ${file.name} importiert.`);
  } catch (error) {
    toast(`Import fehlgeschlagen: ${errorText(error)}`);
  }
  event.target.value = '';
  delete event.target.dataset.analysisImport;
});
document.querySelector('#alarm-file-input').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    alarmAudioUrl = reader.result;
    data.alarmSettings.toneMode = 'mp3';
    data.alarmSettings.mp3Name = file.name;
    data.alarmSettings.mp3DataUrl = reader.result;
    save();
    render();
    toast(`${file.name} als Alarmton ausgewählt.`);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.repeat) return;
  const warningButton = document.querySelector('[data-dismiss-warning]');
  if (!warningButton) return;
  event.preventDefault();
  warningButton.click();
});
// Offline-Betrieb und dauerhafter Speicher (iPad/Safari loescht sonst ungenutzte Website-Daten)
if (location.protocol.startsWith('http') && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
render();
fetchWeather();
initFolderWatch();
setInterval(() => { processTyreCounts(); if (view === 'dashboard') dashboard(); }, 1000);
setInterval(() => fetchWeather(), 10 * 60 * 1000);
document.addEventListener('click', event => { if (event.target.dataset.action === 'refresh-weather') { fetchWeather(true); toast('Wetter wird aktualisiert …'); } });