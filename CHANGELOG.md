# Änderungsprotokoll

Alle nennenswerten Änderungen am Tourenplaner stehen hier, die neueste Version oben.

Die Versionsnummern folgen der [semantischen Versionierung](https://semver.org/lang/de/): `MAJOR.MINOR.PATCH`

- **MAJOR** steigt bei Änderungen, nach denen alte Daten oder Abläufe nicht mehr ohne Weiteres funktionieren.
- **MINOR** steigt bei neuen Funktionen, die bestehende Daten weiter lesen können.
- **PATCH** steigt bei Fehlerbehebungen und kleinen Verbesserungen ohne neue Funktion.

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

[1.1.0]: ../../releases/tag/v1.1.0
[1.0.0]: ../../releases/tag/v1.0.0
