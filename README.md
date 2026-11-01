# Peptid-Kalender

Eine schlanke Web-App (PWA) zum Tracken der Einnahme von Peptiden – aufgebaut als Kalender.

## Funktionen

- **Peptide anlegen** mit Name, Dosis, Einheit (mcg, mg, IE, ml, Einheiten), Farbe und Notizen
- **Einnahmerhythmus festlegen**
  - täglich
  - alle X Tage (z. B. jeden 2. Tag)
  - bestimmte Wochentage (z. B. Mo/Mi/Fr)
  - Zyklus: X Tage an / Y Tage Pause (z. B. 5 an / 2 aus)
- mehrere **Uhrzeiten** pro Einnahmetag, **Start- und Enddatum**, Peptide **pausieren**
- **Monatskalender** mit farbigen Punkten pro Peptid (gefüllt = eingenommen)
  - grüner Marker: alles eingenommen · roter Marker: verpasst · grauer Marker: erledigt mit Auslassungen
- Tagesansicht: jede Einnahme als **eingenommen ✓** oder **ausgelassen ✕** markieren (Zeitpunkt wird gespeichert)
- **Export/Import** als JSON (Backup bzw. Gerätewechsel)
- Läuft **offline** und lässt sich auf dem Handy zum Startbildschirm hinzufügen
- Hell-/Dunkelmodus automatisch

Alle Daten bleiben lokal im Browser (`localStorage`) – es gibt keinen Server.

## Starten

Keine Abhängigkeiten, kein Build-Schritt. Einfach einen statischen Webserver im Projektordner starten:

```bash
npm start            # startet http://localhost:8080
# oder
python3 -m http.server 8080
```

Zum Installieren auf dem Handy die Seite (über HTTPS, z. B. via GitHub Pages) öffnen und
„Zum Home-Bildschirm hinzufügen“ wählen.

## Tests

```bash
npm test
```

Die Termin-Logik (`js/schedule.js`) ist DOM-frei und mit `node:test` getestet.

## Struktur

| Datei | Zweck |
| --- | --- |
| `index.html` | Oberfläche (Kalender, Peptid-Liste, Formular) |
| `styles.css` | Styles, mobil optimiert |
| `js/app.js` | UI-Logik |
| `js/schedule.js` | Berechnung, wann eine Einnahme fällig ist |
| `js/storage.js` | Speichern/Laden in `localStorage` |
| `sw.js`, `manifest.webmanifest` | Offline-Support / PWA |

> Hinweis: Die App ist ein reines Tracking-Werkzeug und ersetzt keine ärztliche Beratung.
