# Änderungsprotokoll

Alle nennenswerten Änderungen am Tourenplaner stehen hier, die neueste Version oben.

Die Versionsnummern folgen der [semantischen Versionierung](https://semver.org/lang/de/): `MAJOR.MINOR.PATCH`

- **MAJOR** steigt bei Änderungen, nach denen alte Daten oder Abläufe nicht mehr ohne Weiteres funktionieren.
- **MINOR** steigt bei neuen Funktionen, die bestehende Daten weiter lesen können.
- **PATCH** steigt bei Fehlerbehebungen und kleinen Verbesserungen ohne neue Funktion.

## [1.4.1] – 2026-11-02

Sicherheitsprüfung vor der Veröffentlichung.

### Sicherheit
- **Code-Einschleusung über Kartentooltips behoben:** Etappentitel und Hotelnamen wurden in Tooltips als HTML
  eingesetzt. Ein präparierter Titel, etwa aus einer GPX-Datei oder vom Sync eines anderen, hätte so Code in der
  App ausführen können. Sie werden jetzt immer als Text dargestellt.
- **Content-Security-Policy** für das App-Fenster: nur eigene Skripte, Bilder nur von den Kartenservern,
  Verbindungen nur über die App
- **Weniger Rechte für die Oberfläche:** das ungenutzte Opener-Recht ist entfernt, nur Dateidialoge bleiben.
- **Befehle eingeschränkt:**
  - GPX-Import liest nur `.gpx`-Dateien, der Export schreibt nur `.gpx` und `.pdf`.
  - Programme und Skripte unter den Dokumenten werden nicht direkt gestartet; sie können ja per Sync von anderen kommen.
- **Sync:** Server-Pfade mit `..`, Laufwerksangaben, Backslashes, versteckten Teilen oder Steuerzeichen werden
  ignoriert. Unter Windows hätten Backslashes sonst aus dem Datenordner herausführen können.
- `config.json` ist nur für den eigenen Benutzer lesbar, falls ohne Schlüsselbund das Passwort darin steht.
- **Abhängigkeiten ohne bekannte Lücken:**
  - jsPDF 4.2 und jsPDF-AutoTable 5 (vorher DOMPurify mit kritischen Lücken)
  - quick-xml 0.42 (DoS über präparierte Serverantworten)
  - Vite 7 und Vitest 5 (Lücken im Entwicklungsserver)
  - zurückgezogenes `async-executor` aktualisiert
- Build-Workflow läuft mit reinem Lesezugriff.
- Neue `SECURITY.md` mit Sicherheitskonzept und Meldeweg

### Geändert
- **Neue App-Kennung** `de.soeren3003.tourenplaner`. Datenordner, Einstellungen und das gespeicherte App-Passwort
  der bisherigen Kennung werden beim ersten Start automatisch übernommen.
- Beispieldaten: Unterkünfte mit eindeutig erfundenen Namen, keine Telefonnummern
- README: Abschnitte „Sicherheit“ und „Hinweise zur Nutzung“ (Straßenverkehr, Daten der Mitfahrer)
- Build-Workflow: Ein Versions-Tag erstellt automatisch ein GitHub-Release mit Installern für macOS (universal),
  Windows (EXE/MSI) und Linux (DEB/AppImage) und mit den Release-Notizen aus diesem Changelog.

## [1.4.0] – 2026-11-02

Prüfung aller Lizenzen und Nutzungsbedingungen vor der Veröffentlichung.

### Neu
- **Lizenzhinweise aller Komponenten:** `THIRD_PARTY_LICENSES.md` enthält die Lizenztexte aller 491 mitgelieferten
  Komponenten (30 npm-Pakete, 461 Rust-Crates). In der App sind sie unter „Über Tourenplaner → Lizenzen aller
  Komponenten anzeigen“ durchsuchbar. Erzeugt werden sie mit `npm run licenses`.
- **Einstellungen → Online-Dienste:** Ortssuche und Wettervorhersage lassen sich ausschalten, und für Routing und
  Ortssuche können eigene Server eingetragen werden. Mit Links zu den Nutzungsbedingungen. Die Einstellungen werden
  mit der Gruppe synchronisiert.
- **Demo-Modus** für die Browser-Vorschau (`?demo`) mit erfundenen Beispieldaten; Startansicht per URL wählbar
- **Screenshots** in der README

### Geändert
- **Esri-Karten entfernt** (Straßenkarte und Satellit): Die Bedingungen erlauben eine kostenlose Nutzung ohne
  Esri-Konto nicht eindeutig. Fällt OpenStreetMap aus, wird jetzt auf OpenTopoMap umgeschaltet.
- **Höchstens eine Anfrage pro Sekunde** an Routing und Ortssuche, wie es FOSSGIS und Nominatim verlangen;
  gleiche Suchanfragen kommen aus einem Zwischenspeicher.
- **Eigener User-Agent** der App auch für die Kartenkacheln.
- **Quellenangabe der Karte** mit Link „Fehler melden“ (verlangt von FOSSGIS/OSM); unter dem Wetter steht
  „Wetterdaten: Open-Meteo.com (CC BY 4.0)“.
- Die Diensteadressen sind nicht mehr fest auf einzelne Server beschränkt; erlaubt sind https-Adressen aus den
  Einstellungen.
- README: Abschnitt zu Nutzungsbedingungen und Datenschutz der Dienste sowie Lizenzübersicht der Komponenten

### Behoben
- **Ein Cent Rundungsdifferenz** bei „Wer zahlt wem?“: Salden und Überweisungen werden jetzt in ganzen Cent gerechnet
  und gehen exakt auf.
- Links in der App, z. B. die Quellenangaben der Karte, öffnen sich im Standardbrowser statt im App-Fenster.

## [1.3.0] – 2026-11-02

### Neu
- **Mitfahrer je Etappe:** Bei jeder Etappe lässt sich unter „Wer fährt mit?“ ein Teil der Gruppe auswählen,
  z. B. Anreise und Rückreise nur für einen Teil, die Rundfahrt mit allen. Ohne Auswahl fahren wie bisher alle mit.
  Sind alle ausgewählt, wird das als „alle“ gespeichert; später hinzukommende Mitfahrer sind dann automatisch dabei.
- Etappenliste, Tagesplan im Überblick und Roadbook (Spalte „Wer“) zeigen, wer bei Teil-Etappen mitfährt.

### Geändert
- **Tank- und Ladestopps** einer Etappe richten sich nach der kleinsten Reichweite der Motorräder, die diese
  Etappe fahren. Fährt das E-Motorrad nicht mit, entfallen Ladestopps und Ladezeit.
- **Sprit- und Stromschätzung** summiert über alle Etappen, jeweils nur für die Mitfahrenden. Bisher wurden
  alle Motorräder der Tour für die ganze Strecke gerechnet.
- **Gefahrene km je Mitfahrer** (Mitfahrer-Seite und Statistik) zählen nur Etappen, die die Person
  mitgefahren ist.
- **Neue Ausgabe:** Fahren an dem Tag nicht alle, wird sie zunächst nur auf die Mitfahrenden des Tages verteilt.

### Kompatibilität
- Bestehende Etappen haben keine Auswahl und gelten weiter als „alle fahren mit“; Ergebnisse ändern sich dort nicht.

## [1.2.1] – 2026-11-02

### Behoben
- Das Fenster „Über Tourenplaner“ und andere Dialoge lagen hinter der Karte, z. B. hinter der Karte der nächsten
  Tour in der Übersicht. Die Karte hält ihre Ebenen jetzt in einem eigenen Stapelkontext, und Dialoge liegen
  immer darüber.

## [1.2.0] – 2026-11-02

### Neu
- **Elektromotorräder**
  - Bei jedem Mitfahrer lässt sich der Antrieb wählen: Verbrenner oder Elektro.
  - Bei Elektro: Verbrauch in kWh/100 km, Reichweite je Akkuladung und Dauer eines Ladestopps.
  - Beim Umschalten werden typische Werte vorgeschlagen (Elektro: 180 km, 9 kWh/100 km).
- **Ladestopps im Etappenplaner**, getrennt von den Tankstopps berechnet nach der kleinsten Reichweite
  der E-Motorräder (mit Reserve)
  - Ladezeit wird auf die voraussichtliche Ankunft aufgeschlagen, auch im Tagesplan und im Roadbook.
  - Anzeige „⚡ n× laden (+Zeit)“ in der Streckenleiste, Karte „Tanken & Laden“ mit Reichweite,
    Stopps, Ladezeit und Verbrauch in kWh
- **Tank- und Ladestopps auf der Karte**: Marker an der ungefähren Stelle der Route, mit Liste und Link
  „Tankstellen suchen“ bzw. „Ladesäulen suchen“ in der Nähe
- **Strompreis je Tour** (je kWh an der Ladesäule, in der Tourwährung) und Vorgabe in den Einstellungen (Standard 0,59 €/kWh)
- Energiekosten: Sprit- und Stromkosten werden getrennt geschätzt und in die Kosten pro Person eingerechnet.
- Neue Ausgabenkategorie **„Laden (Strom)“**; sobald sie erfasst ist, ersetzt sie die Stromschätzung.
- Unterkünfte: Option **„Lademöglichkeit fürs E-Motorrad“**. Der Etappenplaner warnt, wenn sie am Abend fehlt.

### Geändert
- „Tankreserve“ heißt jetzt „Reichweiten-Reserve“ und gilt für Tank und Akku.
- Zusammenfassung im Tour-Überblick zeigt Tank- und Ladestopps der ganzen Tour.

### Kompatibilität
- Bestehende Daten werden ohne Umwandlung weiter gelesen: Mitfahrer ohne Antrieb gelten als Verbrenner,
  Touren ohne Strompreis übernehmen die Vorgabe aus den Einstellungen.

## [1.1.0] – 2026-11-02

### Neu
- **Informationsfenster „Über Tourenplaner“**, erreichbar unten in der Seitenleiste. Es zeigt:
  - Version und Autor (Soeren3003)
  - die Entstehung in Zusammenarbeit mit der KI Claude
  - die MIT-Lizenz in Kurzform und auf Wunsch den vollständigen Lizenztext
  - die verwendeten Bibliotheken, Kartendaten und Online-Dienste mit Links
- Die aktuelle Versionsnummer steht in der Seitenleiste.

### Geändert
- Als Autor und Rechteinhaber steht jetzt durchgängig „Soeren3003“
  (LICENSE, package.json, Cargo.toml, Copyright-Vermerk der App).

## [1.0.0] – 2026-11-02

Erste veröffentlichte Version.

### Neu
- Touren mit Zeitraum, Region, Status, Mitfahrern, Währung und Spritpreis
- Etappenplaner mit Karte und Motorrad-Routing (Valhalla): Wegpunkte per Klick, Ziehen und Ortssuche,
  Autobahnen, Maut und Fähren meiden, km und Fahrzeit je Teilstück, voraussichtliche Ankunft
- Tankstopps nach der kleinsten Reichweite der Gruppe, Spritverbrauch und Spritkosten
- Wettervorhersage am Etappenziel (Open-Meteo)
- GPX-Import und -Export, Etappe in Google Maps öffnen
- Unterkünfte mit Karte, Status, Preis, Garage und Hinweis auf Nächte ohne Unterkunft
- Kostenaufteilung mit Fremdwährungen, Teilgruppen, Salden und „Wer zahlt wem?“
- Checkliste je Tour, Dokumente je Tour, Roadbook als PDF
- Übersicht mit Countdown und Statistik über alle Touren
- Abgleich mit Nextcloud bzw. WebDAV
- MIT-Lizenz

[1.4.1]: ../../releases/tag/v1.4.1
[1.4.0]: ../../releases/tag/v1.4.0
[1.3.0]: ../../releases/tag/v1.3.0
[1.2.1]: ../../releases/tag/v1.2.1
[1.2.0]: ../../releases/tag/v1.2.0
[1.1.0]: ../../releases/tag/v1.1.0
[1.0.0]: ../../releases/tag/v1.0.0
