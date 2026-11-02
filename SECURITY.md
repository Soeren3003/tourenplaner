# Sicherheit

## Sicherheitslücken melden

Bitte melde vermutete Sicherheitslücken **nicht als öffentliches Issue**. Schreibe stattdessen eine Nachricht
an **[Soeren3003](https://github.com/Soeren3003)** über die Kontaktmöglichkeit im GitHub-Profil. Beschreibe darin kurz:

- was passiert und wie es sich nachstellen lässt,
- welche Version betroffen ist (siehe *Über Tourenplaner*),
- welches Betriebssystem du nutzt.

Ich melde mich so bald wie möglich. Behobene Lücken stehen im [CHANGELOG.md](CHANGELOG.md).

## Unterstützte Versionen

Sicherheitskorrekturen gibt es für die jeweils neueste Version.

## Sicherheitskonzept

Der Tourenplaner ist eine lokale Desktop-App. Daten können aber von außen hereinkommen: per Sync von anderen
Gruppenmitgliedern, als GPX-Datei aus dem Internet oder als Antwort eines Servers. Deshalb gilt:

- **Keine Geheimnisse im Repository.** Zugangsdaten gibt es nur lokal. Das Nextcloud-App-Passwort liegt im
  Schlüsselbund des Systems. Nur wenn keiner verfügbar ist, liegt es in `config.json`, und diese Datei ist dann nur
  für den eigenen Benutzer lesbar.
- **Strikte Content-Security-Policy:** Die Oberfläche lädt nur eigene Skripte. Bilder kommen nur von den
  Kartenservern, Verbindungen laufen nur über die App selbst.
- **Kein HTML aus fremden Daten:** Titel, Namen und Notizen werden immer als Text dargestellt, auch in Kartentooltips.
- **Wenig Rechte für die Oberfläche:** Sie darf nur Dateidialoge öffnen. Alles Weitere läuft über eigene Befehle,
  und die prüfen ihre Eingaben:
  - Datensätze und Dateinamen dürfen keine Pfadangaben enthalten.
  - Importiert werden nur GPX-Dateien, exportiert nur GPX- und PDF-Dateien.
  - Links öffnen nur, wenn sie mit `http(s)` beginnen.
  - Programme und Skripte unter den Dokumenten werden nicht direkt gestartet.
- **Sync:** Pfade vom Server, die den Datenordner verlassen würden (`..`, Laufwerksangaben, Backslashes,
  versteckte Dateien), werden ignoriert. Verbindungen laufen über HTTPS (rustls).
- **Online-Dienste** nur über HTTPS, mit eigenem User-Agent und Ratenbegrenzung.
- **Abhängigkeiten** werden mit `npm audit` und `cargo audit` geprüft.
