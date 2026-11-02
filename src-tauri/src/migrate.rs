//! Übernahme der Daten, wenn sich die App-Kennung (und damit die Ordner) geändert hat.
//!
//! Die Ordner heißen wie die Kennung, z. B. `…/Application Support/<kennung>`. Gibt es den neuen
//! Ordner noch nicht, wird ein früherer Ordner derselben App (gleiche Endung `.tourenplaner`,
//! andere Kennung) umbenannt. So bleiben Touren, Einstellungen und Sync-Stand erhalten.

use std::fs;
use std::path::{Path, PathBuf};

pub const SUFFIX: &str = ".tourenplaner";

fn is_app_dir(p: &Path) -> bool {
    p.join("config.json").is_file() || p.join("data").is_dir()
}

fn is_empty_or_missing(p: &Path) -> bool {
    fs::read_dir(p).map(|mut d| d.next().is_none()).unwrap_or(true)
}

/// Früherer Ordner im selben Elternordner; bei mehreren der zuletzt geänderte.
pub fn find_previous(new_dir: &Path) -> Option<PathBuf> {
    let parent = new_dir.parent()?;
    let own = new_dir.file_name()?.to_str()?;
    fs::read_dir(parent)
        .ok()?
        .flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            n.ends_with(SUFFIX) && n != own && e.path().is_dir() && is_app_dir(&e.path())
        })
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok())
        .map(|e| e.path())
}

/// Benennt den früheren Ordner um; liefert dessen Namen (= alte Kennung), falls übernommen.
pub fn move_previous(new_dir: &Path) -> Result<Option<String>, String> {
    if !is_empty_or_missing(new_dir) {
        return Ok(None);
    }
    let Some(old) = find_previous(new_dir) else { return Ok(None) };
    if new_dir.exists() {
        fs::remove_dir(new_dir).map_err(|e| e.to_string())?;
    }
    fs::rename(&old, new_dir).map_err(|e| format!("{} → {}: {e}", old.display(), new_dir.display()))?;
    Ok(old.file_name().map(|n| n.to_string_lossy().into_owned()))
}

/// Pfad, der in den alten Ordner zeigte, auf den neuen umbiegen.
pub fn rebase(path: &str, old_dir: &Path, new_dir: &Path) -> Option<String> {
    Path::new(path).strip_prefix(old_dir).ok().map(|rest| new_dir.join(rest).to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("tourenplaner-migrate-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn moves_previous_app_folder() {
        let root = tmp("move");
        let old = root.join("de.alt.tourenplaner");
        fs::create_dir_all(old.join("data/db/tours")).unwrap();
        fs::write(old.join("data/db/tours/t1.json"), "{}").unwrap();
        fs::create_dir_all(root.join("de.alt.druckplaner/data")).unwrap(); // andere App bleibt unberührt
        let new = root.join("de.neu.tourenplaner");

        assert_eq!(move_previous(&new).unwrap().as_deref(), Some("de.alt.tourenplaner"));
        assert!(new.join("data/db/tours/t1.json").is_file());
        assert!(!old.exists());
        assert!(root.join("de.alt.druckplaner").exists());
        // zweiter Start: nichts mehr zu tun
        assert_eq!(move_previous(&new).unwrap(), None);
    }

    #[test]
    fn keeps_existing_new_folder() {
        let root = tmp("keep");
        fs::create_dir_all(root.join("de.alt.tourenplaner/data")).unwrap();
        fs::create_dir_all(root.join("de.neu.tourenplaner/data")).unwrap();
        assert_eq!(move_previous(&root.join("de.neu.tourenplaner")).unwrap(), None);
        assert!(root.join("de.alt.tourenplaner").exists());
    }

    #[test]
    fn rebases_paths() {
        let r = rebase("/x/de.alt.tourenplaner/data", Path::new("/x/de.alt.tourenplaner"), Path::new("/x/de.neu.tourenplaner"));
        assert_eq!(r.as_deref(), Some("/x/de.neu.tourenplaner/data"));
        assert_eq!(rebase("/elsewhere/data", Path::new("/x/de.alt.tourenplaner"), Path::new("/x/n")), None);
    }
}
