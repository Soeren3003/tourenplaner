//! Zugriff auf Online-Dienste (Routing, Ortssuche, Wetter).
//!
//! Die Anfragen laufen über Rust, damit ein eigener User-Agent gesendet wird (Pflicht bei
//! Nominatim und den FOSSGIS-Servern) und CORS keine Rolle spielt. Die Adressen der Dienste
//! sind in den Einstellungen änderbar; erlaubt sind nur https-Adressen.
//!
//! Nutzungsbedingungen: höchstens eine Anfrage pro Sekunde je Dienst (Nominatim, FOSSGIS),
//! gleiche Anfragen an die Ortssuche werden aus dem Zwischenspeicher beantwortet.

use reqwest::Client;
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub const USER_AGENT: &str = concat!("Tourenplaner/", env!("CARGO_PKG_VERSION"), " (Motorradtouren-Planer)");

/// Mindestabstand zwischen zwei Anfragen an denselben Dienst
const MIN_INTERVAL: Duration = Duration::from_millis(1100);
const CACHE_MAX: usize = 500;

fn client() -> &'static Client {
    static C: OnceLock<Client> = OnceLock::new();
    C.get_or_init(|| Client::builder().timeout(Duration::from_secs(60)).user_agent(USER_AGENT).build().expect("HTTP-Client"))
}

/// Zeitpunkt der letzten Anfrage je Host; das Schloss je Host reiht Anfragen nacheinander ein.
fn throttles() -> &'static std::sync::Mutex<HashMap<String, &'static Mutex<Option<Instant>>>> {
    static T: OnceLock<std::sync::Mutex<HashMap<String, &'static Mutex<Option<Instant>>>>> = OnceLock::new();
    T.get_or_init(Default::default)
}

fn throttle_for(host: &str) -> &'static Mutex<Option<Instant>> {
    let mut map = throttles().lock().unwrap();
    map.entry(host.to_string()).or_insert_with(|| Box::leak(Box::new(Mutex::new(None))))
}

fn cache() -> &'static std::sync::Mutex<HashMap<String, String>> {
    static C: OnceLock<std::sync::Mutex<HashMap<String, String>>> = OnceLock::new();
    C.get_or_init(Default::default)
}

pub fn host(url: &str) -> Option<&str> {
    let rest = url.strip_prefix("https://")?;
    let h = rest.split(['/', '?', ':', '#']).next().unwrap_or("");
    (!h.is_empty()).then_some(h)
}

/// Ortssuche: Ergebnisse ändern sich praktisch nie – Wiederholungen nicht erneut anfragen.
fn cacheable(url: &str, body: &Option<String>) -> bool {
    body.is_none() && (url.contains("/search?") || url.contains("/reverse?"))
}

/// GET ohne, POST mit Body (JSON). Liefert den Antworttext.
pub async fn request(url: &str, body: Option<String>) -> Result<String, String> {
    let h = host(url).ok_or("Nur https-Adressen sind erlaubt.")?.to_string();
    let use_cache = cacheable(url, &body);
    if use_cache {
        if let Some(hit) = cache().lock().unwrap().get(url) {
            return Ok(hit.clone());
        }
    }

    let text = {
        // Open-Meteo erlaubt 600 Anfragen pro Minute – dort nicht bremsen, sonst lädt das Wetter der Etappen langsam.
        let mut last = throttle_for(if h.ends_with("open-meteo.com") { "" } else { &h }).lock().await;
        if let (Some(t), false) = (*last, h.ends_with("open-meteo.com")) {
            let wait = MIN_INTERVAL.saturating_sub(t.elapsed());
            if !wait.is_zero() {
                tokio::time::sleep(wait).await;
            }
        }
        let rb = match &body {
            Some(b) => client().post(url).header("Content-Type", "application/json").body(b.clone()),
            None => client().get(url),
        };
        let result = rb.send().await;
        *last = Some(Instant::now());
        let r = result.map_err(|e| format!("Keine Verbindung zu {h} ({e})"))?;
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
        text
    };

    if use_cache {
        let mut c = cache().lock().unwrap();
        if c.len() >= CACHE_MAX {
            c.clear();
        }
        c.insert(url.to_string(), text.clone());
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
        assert_eq!(host("https://"), None);
        assert_eq!(host("https://evil.com/api.open-meteo.com"), Some("evil.com"));
    }

    #[test]
    fn only_place_search_is_cached() {
        assert!(cacheable("https://nominatim.openstreetmap.org/search?q=x", &None));
        assert!(cacheable("https://nominatim.openstreetmap.org/reverse?lat=1", &None));
        assert!(!cacheable("https://valhalla1.openstreetmap.de/route", &Some("{}".into())));
        assert!(!cacheable("https://api.open-meteo.com/v1/forecast?x", &None));
    }
}
