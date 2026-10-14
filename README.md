# Mega Godzilla Racing Manager

Deutsche Testumgebung fuer die Organisation eines RC-Car-Renntags.

## Unter Windows 11 testen

Die Datei `index.html` im Browser oeffnen. Es gibt keinen Build-Schritt. Alle Daten werden lokal im Browser (`localStorage`) gespeichert. Fuer PDF-Import und Wetter wird eine Internetverbindung benoetigt (PDF.js vom CDN, Wetterdaten von Open-Meteo).

## Auf dem iPad nutzen

Die App ist unter https://coolzerox66.github.io/mg-racing/ veroeffentlicht (oeffentliches Repo `CoolzeroX66/mg-racing`, enthaelt nur den Programmstand ohne Historie; dieses Repo bleibt privat).

1. Die Adresse in Safari oeffnen, dann **Teilen > Zum Home-Bildschirm**. Die App startet danach ohne Safari-Leisten.
2. Einmal mit Internet oeffnen: App und PDF-Leser werden gespeichert, danach laeuft sie auch ohne Netz an der Strecke (Wetter braucht weiterhin Internet).
3. Nach dem Start einmal auf den Bildschirm tippen: Erst dann darf iOS den Alarmton abspielen. Solange die App offen ist, bleibt der Bildschirm an (ab iPadOS 16.4), sonst kaemen die Countdown-Alarme bei gesperrtem iPad nicht.
4. PDFs werden ueber **PDF-Import** aus der Dateien-App, iCloud Drive oder einem Mail-Anhang (vorher in Dateien sichern) gewaehlt.

Nicht auf dem iPad: Automatischer Ergebnis-Import (Ordnerueberwachung gibt es nur in Edge/Chrome am PC) und der Reifen-Dienst (laeuft nur am PC). Daten liegen getrennt je Geraet bzw. Browser; was am PC erfasst wurde, ist auf dem iPad nicht automatisch vorhanden.

**Neuen Stand veroeffentlichen**: Aenderungen hier committen, dann `tools\ipad-veroeffentlichen.ps1` ausfuehren. Das Skript uebertraegt den letzten Commit als neuen Stand ins oeffentliche Repo (mit anonymer GitHub-Adresse als Autor). Das iPad laedt den neuen Stand beim naechsten Oeffnen mit Internet.

## Android-Ziel

Die Anwendung ist als PWA vorbereitet, PDF.js fuer den PDF-Textimport ist bereits eingebunden. Der naechste technische Schritt ist das Verpacken mit Capacitor als Android-App. Die lokale Datenhaltung bleibt dabei erhalten.

## Funktionen

- **Renntag**: Renntag anlegen (Name, Datum, Ort, Veranstalter). Unter **Renntag bearbeiten** lassen sich die Angaben aendern.
- **Dashboard**: Bis zu drei ausgewaehlte Fahrer mit Countdown zum naechsten Lauf. Laeufe lassen sich um +/- 1 oder 5 Minuten verschieben. Vor dem Start erscheint ein Alarm (z. B. zum Reifen-Fetten), der per Enter bestaetigt wird. Haben die Fahrer unterschiedliche Rennklassen, bekommt jeder eine eigene Kachel. Optional mit Wetter-Widget.
- **Fahrer**: Importierte Fahrer anzeigen und maximal drei fuer das Dashboard aktivieren.
- **Zeitplan**: Importierter Zeitplan mit Rennklasse, Gruppe, Lauf sowie Start- und Endzeit.
- **PDF-Import**: Drei getrennte Datei-Importe:
  - Gruppeneinteilung Vorlauf
  - Gruppeneinteilung Finale
  - Zeitplan

## Ablauf Vorlaeufe -> Finallaeufe

1. Vor dem Rennen: Gruppeneinteilung Vorlauf und Zeitplan importieren. Das Dashboard zeigt Countdown und Alarme fuer die Vorlaeufe.
2. Sind alle Vorlaeufe der ausgewaehlten Fahrer beendet, erscheint im Dashboard ein Hinweis mit Button: **Finaleinteilung importieren**.
3. Enthaelt der Zeitplan noch keine Finallaeufe (z. B. Race-Control 2004 mit getrenntem Zeitplan Finallaeufe), erscheint danach der Hinweis **Zeitplan importieren**. Ein erneuter Zeitplan-Import ersetzt nur die Laufarten, die in der Datei enthalten sind: Ein reiner Final-Zeitplan laesst die Vorlaeufe unveraendert.
4. Danach laufen Countdown, Zeitverschiebung und Alarme mit derselben Logik fuer die Finallaeufe weiter.
- **Einstellungen**: Test-Uhrzeit, Warnungen (Vorlaufzeit, Zusatzalarm, eingebauter Ton oder eigene MP3, Lautstaerke), Wetter-Prognose fuer einen Ort und Loeschen aller lokalen Renntag-Daten (mit Rueckfrage). Das Reifen-Management bleibt dabei erhalten (Reifensaetze mit Lauf-Zaehlern und Einsatz-Protokoll, eigene Hersteller und Modelle, Reifen-Katalog, Haendler-Bestand, Einstellungen zum Reifen-Einsatz) und dient als Basis fuer den naechsten Renntag; geloescht werden nur die Reifen-Auswahl je Lauf und der eigene Fahrer.
- **Renn-Analyse**: Pro Rennklasse der Dashboard-Fahrer werden alle Gruppen und Laeufe aus dem importierten Zeitplan angezeigt (Vorlaufgruppen und Finale A/B/C). Gruppen mit eigenen Fahrern sind aufgeklappt. Je Lauf kann das Ergebnis-PDF importiert werden; gehoert das PDF laut Kopfzeile zu einem anderen Lauf, wird es automatisch dort abgelegt. In der Analyse eines Laufs erscheinen alle Starter der Gruppe mit Position, Runden, Gesamtzeit, Bestzeit und Durchschnitt (DNS-Fahrer ausgegraut). Nach dem Import sind alle Fahrer im Vergleich; per Haekchen lassen sich einzelne Fahrer abwaehlen, "Nur meine Fahrer" zeigt nur die Dashboard-Fahrer. Das Diagramm zeigt die Rundenzeiten mit markierter Bestrunde, eigene Fahrer werden hervorgehoben. Die verkuerzte Startrunde (Weg bis zur Ziellinie) wird nicht als Runde gewertet.
- **Automatischer Ergebnis-Import** (in der Renn-Analyse, nur Microsoft Edge / Google Chrome am PC): Einmal den Ordner waehlen, in den die Zeitnahme die Laufergebnisse speichert. Die App prueft alle 30 Sekunden (einstellbar: 15/30/60/120 s) auf neue oder geaenderte PDFs direkt in diesem Ordner (Unterordner werden ignoriert). Laufergebnisse, die zu einem Lauf im Zeitplan passen, werden importiert; eine neuere Datei fuer denselben Lauf ersetzt das alte Ergebnis. Andere PDFs werden uebersprungen und im Protokoll vermerkt. Beim Start vorhandene Dateien werden ebenfalls importiert. Nach dem Neuladen der Seite muss der Ordner-Zugriff einmal per Klick auf "Ueberwachung fortsetzen" bestaetigt werden (Sicherheitsregel des Browsers).
- **Reifen-Management**: Reifensaetze aus dem Reifen-Katalog verwalten (eigene Hersteller und Modelle ergaenzbar). Jede Zeile ist ein Satz mit eindeutiger Reifen-Nr. und eigenem Lauf-Zaehler (nur Anzeige, wird automatisch erhoeht; Tooltip zeigt die letzten Einsaetze). In der Spalte "Reifenkante" wird per Haekchen vermerkt, ob der Satz eine Reifenkante hat. Angehakte Saetze stehen am Renntag im Dashboard zur Auswahl. Belag je Reifen: Asphalt, Teppich, Asphalt & Teppich oder ohne Angabe. Einstellungen: max. Reifensaetze je Klasse und Renntag (Warnung, z. B. 2 laut TOS-Reglement), Verschleiss-Warnung ab N Laeufen, Belag am Renntag (Hinweis bei Reifen fuer den anderen Belag).
- **Reifen-Einsatz im Dashboard**: Unter **Fahrer** festlegen, welcher Fahrer "ich" bin. Bei diesem Fahrer erscheint im Dashboard je Rennklasse fuer den naechsten Lauf die Auswahl der angehakten Reifensaetze (erneuter Klick hebt die Auswahl auf, bis Laufende aenderbar). Der gewaehlte Satz bleibt in dieser Klasse fuer die folgenden Laeufe eingesetzt, bis ein anderer gewaehlt wird. Nach jedem beendeten Lauf (Endzeit inkl. Zeitverschiebung) wird der Zaehler des eingesetzten Satzes automatisch um 1 erhoeht und der Einsatz protokolliert; jeder Lauf wird nur einmal gezaehlt. Laeufe, die bei geschlossener App zu Ende gingen, werden beim naechsten Oeffnen nachgezaehlt.

## Reifen-Katalog

Der Katalog in `tyre-catalog.js` enthaelt alle Hohlkammer-Kompletträder fuer 1:10 Tourenwagen von rc-kleinkram.de (Sortiert nach Kategorien > Reifen & Felgen > 1:10 - Tourenwagen > Kompletträder > Hohlkammer). Je Reifen werden Hersteller, Hersteller-Artikelnummer, Bezeichnung (ohne Belag) und Belag gespeichert.

In der Tabelle "Meine Reifen" zeigt die Spalte "Bestand Haendler" fuer jeden Katalog-Reifen den zuletzt bekannten Bestand mit Datum und Uhrzeit der Ermittlung; bei laufendem Reifen-Dienst wird er beim Oeffnen der Seite live nachgeladen (hoechstens alle 5 Minuten je Reifen). Selbst angelegte Modelle haben keinen Bestand. Beim Auswaehlen eines Modells zeigt das Formular den Bestand bei rc-kleinkram.de: sofort den Stand der letzten Katalog-Aktualisierung, danach den aktuellen Bestand live von der Produktseite (mit Link zum Haendler).

**Reifen-Dienst**: Der Browser darf rc-kleinkram.de nicht direkt abrufen. Dafuer gibt es einen kleinen lokalen Dienst (`tools/reifen-dienst.mjs`, nur von diesem PC erreichbar). Einmal per Doppelklick auf `reifen-dienst-starten.cmd` starten (benoetigt Node.js) und das Fenster offen lassen. Danach im Reifen-Formular auf **Katalog aktualisieren** klicken (dauert ca. 30 Sekunden): Der Dienst liest die Kategorie neu ein, schreibt `tyre-catalog.js` und die App uebernimmt den neuen Stand sofort. Laeuft der Dienst nicht, bleibt der letzte Katalog nutzbar und die App zeigt einen Hinweis. Die Hersteller kommen aus dem Hersteller-Filter des Shops; steht Asphalt/Teppich nicht im Titel, wird die Produktbeschreibung ausgewertet. Selbst angelegte Hersteller und Modelle sowie bereits erfasste Reifen bleiben beim Aktualisieren erhalten.

## PDF-Import

Beim Import werden Name, Rennklasse, Gruppe und Rang gespeichert. Namen werden einheitlich als `Nachname, Vorname` abgelegt, Lizenz- und Fahrernummern werden nicht als Teil des Namens uebernommen.

Vertauschte Namen (z. B. `Christian, Kohrn`) werden nach jedem Fahrer- oder Ergebnis-Import erkannt: entweder weil die umgekehrte Schreibweise bereits bekannt ist oder weil vor dem Komma ein gaengiger Vorname steht. Ein Hinweis zeigt die gefundene Schreibweise und den Vorschlag; per Auswahl wird korrigiert. Bestaetigte Korrekturen werden gespeichert und bei spaeteren Importen automatisch angewendet, abgelehnte Namen werden nicht erneut abgefragt. Unterstuetzt werden zwei Zeitnahme-Programme:

- **RC-Timing / RCM** (z. B. Rheda): Einteilungen mit Ueberschriften wie `Fronti [PW Cup Fronti] - Qualifikation - Gruppe 1` bzw. `Fronti [PW Cup Fronti] - Finale B` (Rennklasse = Name in eckigen Klammern) sowie der Zeitplan mit Start- und Endzeiten.
- **Race-Control 2004** (z. B. Buende, Wagenfeld): Gruppeneinteilung (`Gruppe 1 • Fun`), Finallaufeinteilung (`A-Finale Fun`), Zeitplan Vorlaeufe (`Gruppe 1 - Fun 5:00 08:30 09:50 11:10`) und Zeitplan Finallaeufe (`13:00 1. C-Finale Touring 5:00`). Die Endzeit wird aus Startzeit und Dauer berechnet.

## Vergleichbare Loesungen

- **RC-Timing**: Rennsteuerung fuer verschiedene Klassen, Sprachautomatisierung, Live-Ergebnisse und AMB/MYLAPS-Transponder.
- **MYLAPS Speedhive**: Mobile Anzeige offizieller Ergebnisse, Live-Renndaten und Vergleich von Rundenzeiten.
- **RC Scoring Pro**: Bekanntes Rennmanagement-System fuer RC-Rennen; die konkrete Funktionsabdeckung sollte vor einer Produktentscheidung direkt geprueft werden.
