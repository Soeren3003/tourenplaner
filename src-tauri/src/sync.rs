//! Zwei-Wege-Abgleich des Datenordners mit einem WebDAV-Ordner.
//!
//! Für jede Datei merken wir uns nach dem Abgleich Inhalts-Hash (lokal) und ETag (Server).
//! Beim nächsten Lauf erkennen wir damit, auf welcher Seite sich etwas geändert hat.
//! Ändern sich beide Seiten, gewinnt bei JSON-Daten der neuere `updatedAt`-Stand,
//! sonst die lokale Datei. Der Verlierer landet unter `conflicts/`.

use crate::webdav::{Dav, RemoteEntry};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const STATE_FILE: &str = ".sync-state.json";
pub const CONFLICT_DIR: &str = "conflicts";

#[derive(Serialize, Deserialize, Default, Clone)]
struct FileState {
    hash: String,
    etag: String,
    size: u64,
    mtime: i64,
}

#[derive(Serialize, Deserialize, Default)]
struct SyncState {
    remote: String,
    files: BTreeMap<String, FileState>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub uploaded: u32,
    pub downloaded: u32,
    pub deleted_local: u32,
    pub deleted_remote: u32,
    pub conflicts: Vec<String>,
    pub errors: Vec<String>,
    pub finished_at: String,
}

struct LocalFile {
    hash: String,
    size: u64,
    mtime: i64,
}

fn sha(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

fn stat(path: &Path) -> std::io::Result<(u64, i64)> {
    let m = fs::metadata(path)?;
    let mtime = m
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Ok((m.len(), mtime))
}

fn scan(root: &Path, dir: &Path, prefix: &str, state: &SyncState, out: &mut BTreeMap<String, LocalFile>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || (prefix.is_empty() && name == CONFLICT_DIR) {
            continue;
        }
        let rel = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            scan(root, &path, &rel, state, out)?;
            continue;
        }
        let (size, mtime) = stat(&path)?;
        let hash = match state.files.get(&rel) {
            Some(s) if s.size == size && s.mtime == mtime && !s.hash.is_empty() => s.hash.clone(),
            _ => sha(&fs::read(&path)?),
        };
        out.insert(rel, LocalFile { hash, size, mtime });
    }
    Ok(())
}

fn local_path(root: &Path, rel: &str) -> PathBuf {
    rel.split('/').fold(root.to_path_buf(), |p, s| p.join(s))
}

fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().expect("Datei hat Elternordner");
    fs::create_dir_all(parent)?;
    let tmp = parent.join(format!(".part-{}", path.file_name().unwrap().to_string_lossy()));
    fs::write(&tmp, data)?;
    fs::rename(&tmp, path)
}

fn updated_at(data: &[u8]) -> Option<String> {
    let v: serde_json::Value = serde_json::from_slice(data).ok()?;
    v.get("updatedAt")?.as_str().map(String::from)
}

struct Ctx<'a> {
    root: &'a Path,
    dav: &'a Dav,
    remote_dirs: HashSet<String>,
    state: SyncState,
    report: SyncReport,
}

impl Ctx<'_> {
    async fn ensure_remote_parent(&mut self, rel: &str) -> Result<(), String> {
        let parts: Vec<&str> = rel.split('/').collect();
        for i in 1..parts.len() {
            let dir = parts[..i].join("/");
            if !self.remote_dirs.contains(&dir) {
                self.dav.mkcol(&dir).await?;
                self.remote_dirs.insert(dir);
            }
        }
        Ok(())
    }

    async fn upload(&mut self, rel: &str, l: &LocalFile) -> Result<(), String> {
        let data = fs::read(local_path(self.root, rel)).map_err(|e| e.to_string())?;
        self.ensure_remote_parent(rel).await?;
        let etag = match self.dav.put(rel, data).await? {
            Some(e) => e,
            None => self.dav.etag(rel).await?,
        };
        self.state.files.insert(rel.into(), FileState { hash: l.hash.clone(), etag, size: l.size, mtime: l.mtime });
        self.report.uploaded += 1;
        Ok(())
    }

    fn store_download(&mut self, rel: &str, data: &[u8], etag: &str) -> Result<(), String> {
        let path = local_path(self.root, rel);
        write_atomic(&path, data).map_err(|e| e.to_string())?;
        let (size, mtime) = stat(&path).map_err(|e| e.to_string())?;
        self.state.files.insert(rel.into(), FileState { hash: sha(data), etag: etag.into(), size, mtime });
        self.report.downloaded += 1;
        Ok(())
    }

    async fn download(&mut self, rel: &str, r: &RemoteEntry) -> Result<(), String> {
        let data = self.dav.get(rel).await?;
        self.store_download(rel, &data, &r.etag)
    }

    fn save_conflict_copy(&self, rel: &str, data: &[u8], side: &str) -> Result<(), String> {
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let name = format!("{stamp}-{side}-{}", rel.replace('/', "__"));
        write_atomic(&self.root.join(CONFLICT_DIR).join(name), data).map_err(|e| e.to_string())
    }

    async fn resolve_conflict(&mut self, rel: &str, l: &LocalFile, r: &RemoteEntry) -> Result<(), String> {
        let remote = self.dav.get(rel).await?;
        if sha(&remote) == l.hash {
            self.state.files.insert(rel.into(), FileState { hash: l.hash.clone(), etag: r.etag.clone(), size: l.size, mtime: l.mtime });
            return Ok(());
        }
        let local = fs::read(local_path(self.root, rel)).map_err(|e| e.to_string())?;
        let local_wins = match (updated_at(&local), updated_at(&remote)) {
            (Some(a), Some(b)) => a >= b,
            _ => true,
        };
        self.report.conflicts.push(rel.into());
        if local_wins {
            self.save_conflict_copy(rel, &remote, "server")?;
            self.upload(rel, l).await
        } else {
            self.save_conflict_copy(rel, &local, "lokal")?;
            self.store_download(rel, &remote, &r.etag)
        }
    }

    async fn sync_path(&mut self, rel: &str, l: Option<&LocalFile>, r: Option<&RemoteEntry>) -> Result<(), String> {
        let s = self.state.files.get(rel).cloned();
        let local_changed = match (l, &s) {
            (Some(l), Some(s)) => l.hash != s.hash,
            (None, None) => false,
            _ => true,
        };
        let remote_changed = match (r, &s) {
            (Some(r), Some(s)) => r.etag != s.etag,
            (None, None) => false,
            _ => true,
        };
        match (l, r) {
            (None, None) => {
                self.state.files.remove(rel);
            }
            (Some(l), None) => {
                if s.is_some() && !local_changed {
                    fs::remove_file(local_path(self.root, rel)).map_err(|e| e.to_string())?;
                    self.state.files.remove(rel);
                    self.report.deleted_local += 1;
                } else {
                    self.upload(rel, l).await?;
                }
            }
            (None, Some(r)) => {
                if s.is_some() && !remote_changed {
                    self.dav.delete(rel).await?;
                    self.state.files.remove(rel);
                    self.report.deleted_remote += 1;
                } else {
                    self.download(rel, r).await?;
                }
            }
            (Some(l), Some(r)) => match (local_changed, remote_changed) {
                (false, false) => {}
                (true, false) => self.upload(rel, l).await?,
                (false, true) => self.download(rel, r).await?,
                (true, true) => self.resolve_conflict(rel, l, r).await?,
            },
        }
        Ok(())
    }
}

fn load_state(root: &Path) -> SyncState {
    fs::read_to_string(root.join(STATE_FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_state(root: &Path, state: &SyncState) -> Result<(), String> {
    let json = serde_json::to_vec(state).map_err(|e| e.to_string())?;
    write_atomic(&root.join(STATE_FILE), &json).map_err(|e| e.to_string())
}

pub async fn run(root: &Path, dav: &Dav, remote_id: &str) -> Result<SyncReport, String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let mut state = load_state(root);
    if state.remote != remote_id {
        state = SyncState { remote: remote_id.into(), files: BTreeMap::new() };
    }

    dav.ensure_root().await?;
    let listing = dav.list_recursive().await?;
    let remote_dirs: HashSet<String> = listing.iter().filter(|e| e.is_dir).map(|e| e.path.clone()).collect();
    let remote: BTreeMap<String, RemoteEntry> = listing
        .into_iter()
        .filter(|e| !e.is_dir && !e.path.split('/').any(|s| s.starts_with('.')))
        .map(|e| (e.path.clone(), e))
        .collect();

    let mut local = BTreeMap::new();
    scan(root, root, "", &state, &mut local).map_err(|e| e.to_string())?;

    // Ist eine Seite komplett leer (neuer Server-Ordner, neuer Datenordner), wird nichts
    // gelöscht, sondern alles von der anderen Seite übernommen.
    if !state.files.is_empty() && (remote.is_empty() != local.is_empty()) {
        state.files.clear();
    }

    let paths: BTreeSet<String> = local.keys().chain(remote.keys()).chain(state.files.keys()).cloned().collect();
    let mut ctx = Ctx { root, dav, remote_dirs, state, report: SyncReport::default() };
    for rel in paths {
        if let Err(e) = ctx.sync_path(&rel, local.get(&rel), remote.get(&rel)).await {
            ctx.report.errors.push(format!("{rel}: {e}"));
        }
    }
    save_state(root, &ctx.state)?;
    ctx.report.finished_at = chrono::Local::now().to_rfc3339();
    Ok(ctx.report)
}
