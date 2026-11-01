//! Zugriff auf freie Online-Dienste: Routing (Valhalla), Ortssuche (Nominatim), Wetter (Open-Meteo).
//! Nur diese Hosts sind erlaubt; Anfragen laufen über Rust, damit ein eigener User-Agent
//! gesetzt werden kann (Pflicht bei Nominatim) und CORS keine Rolle spielt.

use reqwest::Client;
use std::sync::OnceLock;
use std::time::Duration;

const ALLOWED_HOSTS: &[&str] = &[
    "valhalla1.openstreetmap.de",
    "nominatim.openstreetmap.org",
    "api.open-meteo.com",
];

fn client() -> &'static Client {
    static C: OnceLock<Client> = OnceLock::new();
    C.get_or_init(|| {
        Client::builder()
            .timeout(Duration::from_secs(60))
            .user_agent(concat!("Tourenplaner/", env!("CARGO_PKG_VERSION"), " (Motorradtouren-Planer)"))
            .build()
            .expect("HTTP-Client")
    })
}

fn host(url: &str) -> Option<&str> {
    let rest = url.strip_prefix("https://")?;
    Some(rest.split(['/', '?', ':']).next().unwrap_or(""))
}

/// GET ohne, POST mit Body (JSON). Liefert den Antworttext.
pub async fn request(url: &str, body: Option<String>) -> Result<String, String> {
    let h = host(url).ok_or("Nur https-Adressen sind erlaubt.")?;
    if !ALLOWED_HOSTS.contains(&h) {
        return Err(format!("Dienst nicht erlaubt: {h}"));
    }
    let rb = match body {
        Some(b) => client().post(url).header("Content-Type", "application/json").body(b),
        None => client().get(url),
    };
    let r = rb.send().await.map_err(|e| format!("Keine Verbindung zu {h} ({e})"))?;
    let status = r.status();
    let text = r.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        // Valhalla liefert Fehler als JSON mit "error"
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(String::from))
            .unwrap_or_else(|| text.chars().take(200).collect());
        return Err(format!("{h}: HTTP {status} – {msg}"));
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_check() {
        assert_eq!(host("https://api.open-meteo.com/v1/forecast?x=1"), Some("api.open-meteo.com"));
        assert_eq!(host("http://api.open-meteo.com/"), None);
        assert_eq!(host("https://evil.com/api.open-meteo.com"), Some("evil.com"));
    }
}
