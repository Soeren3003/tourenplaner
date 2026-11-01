//! Ablage im Datenordner:
//!
//! ```text
//! db/<sammlung>/<id>.json   Touren, Etappen, Hotels, Ausgaben, Mitfahrer, Einstellungen
//! files/<tour>/<name>       Dokumente je Tour (Buchungsbestätigungen, GPX, Fotos …)
//! ```

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const COLLECTIONS: &[&str] = &["tours", "stages", "hotels", "expenses", "members", "settings"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMeta {
    pub name: String,
    pub size: u64,
    pub modified: i64,
}

fn check_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty() && id.len() <= 80 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok { Ok(()) } else { Err(format!("Ungültige Kennung: {id}")) }
}

/// Dateinamen dürfen keine Pfadanteile enthalten.
pub fn check_file_name(name: &str) -> Result<(), String> {
    let bad = name.is_empty()
        || name.starts_with('.')
        || name.contains(['/', '\\', ':', '\0'])
        || name == ".."
        || name.len() > 200;
    if bad { Err(format!("Ungültiger Dateiname: {name}")) } else { Ok(()) }
}

fn collection_dir(data: &Path, collection: &str) -> Result<PathBuf, String> {
    if !COLLECTIONS.contains(&collection) {
        return Err(format!("Unbekannte Sammlung: {collection}"));
    }
    Ok(data.join("db").join(collection))
}

fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("Kein Elternordner")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!(".tmp-{}", path.file_name().unwrap().to_string_lossy()));
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub fn db_list(data: &Path, collection: &str) -> Result<Vec<Value>, String> {
    let dir = collection_dir(data, collection)?;
    let Ok(entries) = fs::read_dir(&dir) else { return Ok(vec![]) };
    let mut out = Vec::new();
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || !name.ends_with(".json") {
            continue;
        }
        if let Ok(v) = fs::read(e.path()).map_err(|_| ()).and_then(|b| serde_json::from_slice::<Value>(&b).map_err(|_| ())) {
            out.push(v);
        }
    }
    Ok(out)
}

pub fn db_put(data: &Path, collection: &str, id: &str, value: &Value) -> Result<(), String> {
    check_id(id)?;
    let json = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    write_atomic(&collection_dir(data, collection)?.join(format!("{id}.json")), &json)
}

pub fn db_delete(data: &Path, collection: &str, id: &str) -> Result<(), String> {
    check_id(id)?;
    let path = collection_dir(data, collection)?.join(format!("{id}.json"));
    match fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

pub fn project_dir(data: &Path, project_id: &str) -> Result<PathBuf, String> {
    check_id(project_id)?;
    Ok(data.join("files").join(project_id))
}

pub fn project_file(data: &Path, project_id: &str, name: &str) -> Result<PathBuf, String> {
    check_file_name(name)?;
    Ok(project_dir(data, project_id)?.join(name))
}

fn meta(path: &Path) -> Option<FileMeta> {
    let m = fs::metadata(path).ok()?;
    Some(FileMeta {
        name: path.file_name()?.to_string_lossy().into_owned(),
        size: m.len(),
        modified: m.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis() as i64,
    })
}

pub fn files_list(data: &Path, project_id: &str) -> Result<Vec<FileMeta>, String> {
    let dir = project_dir(data, project_id)?;
    let Ok(entries) = fs::read_dir(&dir) else { return Ok(vec![]) };
    let mut out: Vec<FileMeta> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|e| meta(&e.path()))
        .collect();
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

/// Freien Namen finden: "route.gpx" → "route (2).gpx" usw.
fn free_name(dir: &Path, name: &str) -> String {
    if !dir.join(name).exists() {
        return name.to_string();
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (2..)
        .map(|n| format!("{stem} ({n}){ext}"))
        .find(|n| !dir.join(n).exists())
        .unwrap()
}

pub fn files_import(data: &Path, project_id: &str, sources: &[String]) -> Result<Vec<FileMeta>, String> {
    let dir = project_dir(data, project_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for src in sources {
        let src = Path::new(src);
        if !src.is_file() {
            continue;
        }
        let name = src.file_name().ok_or("Ungültiger Pfad")?.to_string_lossy().into_owned();
        check_file_name(&name)?;
        let target = dir.join(free_name(&dir, &name));
        fs::copy(src, &target).map_err(|e| format!("{name}: {e}"))?;
        out.extend(meta(&target));
    }
    Ok(out)
}

/// Schreibt eine exportierte Datei (GPX, PDF) an den vom Benutzer gewählten Ort.
pub fn export_file(target: &str, bytes: &[u8]) -> Result<(), String> {
    fs::write(target, bytes).map_err(|e| e.to_string())
}
