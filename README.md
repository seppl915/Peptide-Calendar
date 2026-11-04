# Peptid-Kalender

Eine schlanke Web-App (PWA) zum Tracken der Einnahme von **Peptiden und Supplements** – aufgebaut als Kalender,
mit Vorratsberechnung und verschlüsseltem Sync zwischen mehreren Geräten.

## Funktionen

- **Peptide & Supplements** in eigenen Bereichen anlegen: Name, Dosis, Einheit, Farbe, Notizen
  - Peptide: mcg, mg, IE, ml, Einheiten
  - Supplements: Kapseln, Tabletten, mg, g, mcg, IE, ml, Tropfen, Messlöffel, Stück
- **Einnahmerhythmus festlegen**: täglich · alle X Tage · bestimmte Wochentage · Zyklus (X Tage an / Y Tage Pause)
- mehrere **Uhrzeiten** pro Einnahmetag, **Start-/Enddatum**, **pausieren**
- **Monatskalender** mit farbigen Punkten (gefüllt = eingenommen); Marker: grün = alles erledigt, rot = verpasst
- Tagesansicht: jede Einnahme als **eingenommen ✓** oder **ausgelassen ✕** markieren
- **Vorratsberechnung**
  - aktueller Vorrat + Packungsgröße; jede abgehakte Einnahme wird automatisch abgezogen
  - Prognose „reicht bis …“ anhand des Einnahmerhythmus, Warnung im Kalender, wenn der Vorrat knapp wird
  - „Nachfüllen“ mit einem Tipp (Packungsgröße wird vorgeschlagen)
  - mg/mcg/g werden automatisch umgerechnet (z. B. Vorrat 5 mg, Dosis 250 mcg)
  - **Rekonstitutions-Rechner** für Peptide: mg pro Fläschchen + ml Wasser → ml bzw. Einheiten auf der U-100-Spritze
- **Dosis-Rechner** (Tab „Rechner“), angelehnt an den [Peptide Dose Calculator](https://peptidelove.github.io):
  - Modi: Spritze (U-100/U-40, 0,3/0,5/1 ml), Pen, Nasenspray, Blend aus mehreren Peptiden
  - berechnet die aufzuziehenden Einheiten/ml – oder umgekehrt die nötige Wassermenge für eine gewünschte Einheitenzahl
  - zeigt Konzentration, Wirkstoff pro Teilstrich, Dosen pro Fläschchen und eine Spritzen-Grafik
  - warnt, wenn die Menge nicht in die Spritze passt oder zu klein zum Ablesen ist
  - Werte lassen sich aus eigenen Peptiden laden und mit einem Tipp ins Peptid übernehmen
- **Sync zwischen Geräten** – Ende-zu-Ende-verschlüsselt (siehe unten)
- **Export/Import** als JSON, **offline** nutzbar, Hell-/Dunkelmodus

## Starten

Keine Abhängigkeiten, kein Build-Schritt – nur Node.js ≥ 18:

```bash
npm start            # http://localhost:8080
```

`server.js` liefert die App aus und stellt gleichzeitig den Sync-Endpunkt bereit.
Ohne Sync funktioniert die App auch auf jedem beliebigen statischen Webspace (z. B. GitHub Pages).

## Sync zwischen Geräten

1. Server irgendwo erreichbar per **HTTPS** betreiben (siehe unten).
2. Gerät 1: *Einstellungen → Server-Adresse eintragen → „Neuen Sync starten“*. Es wird ein Sync-Schlüssel angezeigt.
3. Gerät 2: gleiche Server-Adresse eintragen → *„Mit Schlüssel verbinden“* → Schlüssel eingeben.

Danach wird automatisch synchronisiert (nach jeder Änderung, beim Öffnen der App und jede Minute).
Gleichzeitige Änderungen auf mehreren Geräten werden zusammengeführt – pro Eintrag gewinnt die neueste Änderung.

**Datenschutz:** Aus dem Sync-Schlüssel werden im Browser eine Raum-ID und ein AES-256-GCM-Schlüssel abgeleitet (HKDF).
Der Server speichert nur den verschlüsselten Datensatz und kann die Inhalte nicht lesen. Der Schlüssel verlässt das Gerät nie –
wer ihn kennt, kann die Daten aber entschlüsseln, also sicher aufbewahren. Geht er verloren, sind die Daten auf
den Geräten weiterhin vorhanden, es lässt sich dann einfach ein neuer Sync starten.

### Server betreiben

```bash
# direkt
PORT=8080 DATA_DIR=/pfad/zu/daten node server.js

# oder mit Docker
docker build -t peptid-kalender .
docker run -d -p 8080:8080 -v peptid-daten:/data peptid-kalender
```

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `8080` | Port |
| `HOST` | `0.0.0.0` | Netzwerk-Interface |
| `DATA_DIR` | `./data` | Ablage der verschlüsselten Sync-Daten |
| `CORS_ORIGIN` | `*` | erlaubte Herkunft, falls die App woanders gehostet wird |

Für HTTPS den Server hinter einen Reverse-Proxy (z. B. Caddy, nginx) oder auf einen Hoster wie Render, Fly.io
oder Railway stellen. Die Web-Crypto-API des Browsers funktioniert nur über HTTPS (oder `localhost`).

## Tests

```bash
npm test
```

Getestet werden Termin-Logik, Vorratsberechnung, Dosis-Rechner, Zusammenführen der Daten sowie Sync-Client und -Server.

## Struktur

| Datei | Zweck |
| --- | --- |
| `index.html`, `styles.css` | Oberfläche (Kalender, Peptide, Supplements, Rechner, Einstellungen) |
| `js/app.js` | UI-Logik |
| `js/schedule.js` | Wann ist eine Einnahme fällig? |
| `js/inventory.js` | Vorrat, Reichweite, Rekonstitution |
| `js/calculator.js`, `js/calc-ui.js` | Dosis-Rechner (Logik / Oberfläche) |
| `js/merge.js` | Zusammenführen von Datenständen |
| `js/sync.js` | Verschlüsselung und Sync-Client |
| `js/storage.js` | Speichern in `localStorage` (inkl. Migration älterer Daten) |
| `server.js` | Statischer Server + Sync-API |
| `sw.js`, `manifest.webmanifest` | Offline-Support / PWA |

Bereits erfasste Daten aus der ersten Version werden beim Start automatisch übernommen.

> Hinweis: Die App ist ein reines Tracking-Werkzeug und ersetzt keine ärztliche Beratung.
