//! Lokale, nicht synchronisierte Einstellungen (Datenordner, WebDAV-Zugang).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const KEYRING_SERVICE: &str = "de.soeren3003.tourenplaner.webdav";

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct WebdavConfig {
    pub enabled: bool,
    /// Nextcloud-Server (https://cloud.example.com) oder vollständige WebDAV-URL.
    pub url: String,
    pub username: String,
    /// Ordner auf dem Server, z. B. "Motorrad/Tourenplaner".
    pub remote_folder: String,
    /// 0 = nur manuell bzw. beim Start.
    pub auto_sync_minutes: u32,
    /// Nur genutzt, wenn kein Schlüsselbund verfügbar ist (z. B. Linux ohne Secret Service).
    #[serde(skip_serializing_if = "String::is_empty")]
    pub password_fallback: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct LocalConfig {
    pub data_dir: String,
    pub webdav: WebdavConfig,
}

impl LocalConfig {
    pub fn data_path(&self) -> PathBuf {
        PathBuf::from(&self.data_dir)
    }

    /// Kennung des Sync-Ziels; ändert sie sich, beginnt der Abgleich von vorn.
    pub fn remote_id(&self) -> String {
        format!(
            "{}|{}|{}",
            self.webdav.url.trim().trim_end_matches('/'),
            self.webdav.username.trim(),
            self.webdav.remote_folder.trim().trim_matches('/')
        )
    }

    /// Kopie ohne Geheimnisse für das Frontend.
    pub fn public(&self) -> LocalConfig {
        let mut c = self.clone();
        c.webdav.password_fallback.clear();
        c
    }
}

pub fn load(config_dir: &Path, default_data_dir: PathBuf) -> LocalConfig {
    let path = config_dir.join("config.json");
    let mut cfg: LocalConfig = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    if cfg.data_dir.trim().is_empty() {
        cfg.data_dir = default_data_dir.to_string_lossy().into_owned();
    }
    if cfg.webdav.remote_folder.trim().is_empty() {
        cfg.webdav.remote_folder = "Tourenplaner".into();
    }
    cfg
}

pub fn save(config_dir: &Path, cfg: &LocalConfig) -> Result<(), String> {
    fs::create_dir_all(config_dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(config_dir.join("config.json"), json).map_err(|e| e.to_string())
}

fn entry(username: &str) -> Result<keyring::Entry, keyring::Error> {
    keyring::Entry::new(KEYRING_SERVICE, username)
}

/// Speichert das Passwort im System-Schlüsselbund; liefert `false`, wenn nur der Fallback ging.
pub fn store_password(cfg: &mut LocalConfig, password: &str) -> bool {
    let user = cfg.webdav.username.trim().to_string();
    match entry(&user).and_then(|e| e.set_password(password)) {
        Ok(()) => {
            cfg.webdav.password_fallback.clear();
            true
        }
        Err(_) => {
            cfg.webdav.password_fallback = password.to_string();
            false
        }
    }
}

pub fn load_password(cfg: &LocalConfig) -> Option<String> {
    if !cfg.webdav.password_fallback.is_empty() {
        return Some(cfg.webdav.password_fallback.clone());
    }
    entry(cfg.webdav.username.trim())
        .and_then(|e| e.get_password())
        .ok()
}
