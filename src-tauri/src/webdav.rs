//! Minimaler WebDAV-Client (getestet mit Nextcloud).

use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, CONTROLS};
use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::{Client, Method, RequestBuilder, Response, StatusCode};
use std::time::Duration;

const SEGMENT: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'&')
    .add(b'\'')
    .add(b'+')
    .add(b'/')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');

const PROPFIND_BODY: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>"#;

#[derive(Debug, Clone)]
pub struct RemoteEntry {
    /// Pfad relativ zum Sync-Ordner, ohne führenden/abschließenden Schrägstrich.
    pub path: String,
    pub is_dir: bool,
    pub etag: String,
}

pub struct Dav {
    client: Client,
    /// Wurzel der Benutzerdateien, endet mit "/".
    root: String,
    folder: Vec<String>,
    user: String,
    pass: String,
}

fn encode(seg: &str) -> String {
    utf8_percent_encode(seg, SEGMENT).to_string()
}

fn url_path(url: &str) -> String {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let path = rest.find('/').map(|i| &rest[i..]).unwrap_or("/");
    percent_decode_str(path).decode_utf8_lossy().into_owned()
}

fn clean_etag(s: &str) -> String {
    s.trim().trim_start_matches("W/").trim_matches('"').to_string()
}

impl Dav {
    pub fn new(url: &str, user: &str, pass: &str, folder: &str) -> Result<Self, String> {
        let mut root = url.trim().trim_end_matches('/').to_string();
        if root.is_empty() {
            return Err("Keine WebDAV-/Nextcloud-Adresse angegeben.".into());
        }
        if user.trim().is_empty() {
            return Err("Kein Benutzername angegeben.".into());
        }
        if !root.starts_with("http://") && !root.starts_with("https://") {
            root = format!("https://{root}");
        }
        if !root.contains("/remote.php/") {
            root = format!("{root}/remote.php/dav/files/{}", encode(user.trim()));
        }
        root.push('/');
        let folder = folder
            .split('/')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .user_agent("Tourenplaner")
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Dav { client, root, folder, user: user.trim().into(), pass: pass.into() })
    }

    fn url(&self, rel: &str, dir: bool) -> String {
        let mut u = self.root.clone();
        let segs = self
            .folder
            .iter()
            .map(String::as_str)
            .chain(rel.split('/').filter(|s| !s.is_empty()));
        for s in segs {
            u.push_str(&encode(s));
            u.push('/');
        }
        if !dir {
            u.pop();
        }
        u
    }

    fn req(&self, method: Method, url: &str) -> RequestBuilder {
        self.client.request(method, url).basic_auth(&self.user, Some(&self.pass))
    }

    async fn send(&self, rb: RequestBuilder, what: &str) -> Result<Response, String> {
        let r = rb.send().await.map_err(|e| format!("{what}: Verbindung fehlgeschlagen ({e})"))?;
        match r.status() {
            StatusCode::UNAUTHORIZED => Err("Anmeldung fehlgeschlagen – Benutzername bzw. App-Passwort prüfen.".into()),
            StatusCode::FORBIDDEN => Err(format!("{what}: Zugriff verweigert (403).")),
            _ => Ok(r),
        }
    }

    fn method(name: &str) -> Method {
        Method::from_bytes(name.as_bytes()).expect("gültige HTTP-Methode")
    }

    /// Legt den Sync-Ordner (inkl. Elternordner) an, falls nötig.
    pub async fn ensure_root(&self) -> Result<(), String> {
        let mut u = self.root.clone();
        for seg in &self.folder {
            u.push_str(&encode(seg));
            u.push('/');
            self.mkcol_url(&u).await?;
        }
        Ok(())
    }

    async fn mkcol_url(&self, url: &str) -> Result<(), String> {
        let r = self.send(self.req(Self::method("MKCOL"), url), "Ordner anlegen").await?;
        let s = r.status();
        if s.is_success() || s == StatusCode::METHOD_NOT_ALLOWED {
            Ok(())
        } else {
            Err(format!("Ordner anlegen ({url}): HTTP {s}"))
        }
    }

    pub async fn mkcol(&self, rel: &str) -> Result<(), String> {
        self.mkcol_url(&self.url(rel, true)).await
    }

    async fn propfind(&self, rel: &str, depth: &str, dir: bool) -> Result<Vec<RemoteEntry>, String> {
        let url = self.url(rel, dir);
        let rb = self
            .req(Self::method("PROPFIND"), &url)
            .header("Depth", depth)
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(PROPFIND_BODY);
        let r = self.send(rb, "Ordner lesen").await?;
        let status = r.status();
        if status == StatusCode::NOT_FOUND {
            return Err(format!("Nicht gefunden: {url}"));
        }
        if status.as_u16() != 207 {
            return Err(format!("Ordner lesen: HTTP {status} – ist die Adresse eine WebDAV-Adresse?"));
        }
        let body = r.text().await.map_err(|e| e.to_string())?;
        let base = url_path(&self.url("", true));
        let mut out = Vec::new();
        for (href, is_dir, etag) in parse_multistatus(&body)? {
            let full = url_path(&href);
            let Some(rel) = full.strip_prefix(&base).or_else(|| (full.clone() + "/").strip_prefix(&base).map(|_| "")) else {
                continue;
            };
            out.push(RemoteEntry { path: rel.trim_matches('/').to_string(), is_dir, etag: clean_etag(&etag) });
        }
        Ok(out)
    }

    /// Listet alle Dateien und Ordner unterhalb des Sync-Ordners.
    pub async fn list_recursive(&self) -> Result<Vec<RemoteEntry>, String> {
        let mut out = Vec::new();
        let mut queue = vec![String::new()];
        while let Some(dir) = queue.pop() {
            for e in self.propfind(&dir, "1", true).await? {
                if e.path == dir {
                    continue;
                }
                if e.is_dir {
                    queue.push(e.path.clone());
                }
                out.push(e);
            }
        }
        Ok(out)
    }

    pub async fn etag(&self, rel: &str) -> Result<String, String> {
        self.propfind(rel, "0", false)
            .await?
            .into_iter()
            .next()
            .map(|e| e.etag)
            .ok_or_else(|| "Kein ETag erhalten".into())
    }

    pub async fn get(&self, rel: &str) -> Result<Vec<u8>, String> {
        let r = self.send(self.req(Method::GET, &self.url(rel, false)), "Herunterladen").await?;
        if !r.status().is_success() {
            return Err(format!("Herunterladen: HTTP {}", r.status()));
        }
        Ok(r.bytes().await.map_err(|e| e.to_string())?.to_vec())
    }

    /// Lädt hoch und liefert den neuen ETag, falls der Server ihn mitschickt.
    pub async fn put(&self, rel: &str, data: Vec<u8>) -> Result<Option<String>, String> {
        let r = self.send(self.req(Method::PUT, &self.url(rel, false)).body(data), "Hochladen").await?;
        if !r.status().is_success() {
            return Err(format!("Hochladen: HTTP {}", r.status()));
        }
        let h = r.headers();
        Ok(h.get("oc-etag").or_else(|| h.get("etag")).and_then(|v| v.to_str().ok()).map(clean_etag))
    }

    pub async fn delete(&self, rel: &str) -> Result<(), String> {
        let r = self.send(self.req(Method::DELETE, &self.url(rel, false)), "Löschen").await?;
        if r.status().is_success() || r.status() == StatusCode::NOT_FOUND {
            Ok(())
        } else {
            Err(format!("Löschen: HTTP {}", r.status()))
        }
    }
}

/// Liefert (href, ist_ordner, etag) je <response>.
fn parse_multistatus(xml: &str) -> Result<Vec<(String, bool, String)>, String> {
    let mut reader = Reader::from_str(xml);
    let mut out = Vec::new();
    let mut cur: Option<(String, bool, String)> = None;
    let mut field: Option<u8> = None; // 0 = href, 1 = etag
    let mut in_rt = false;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => match e.local_name().as_ref() {
                b"response" => cur = Some(Default::default()),
                b"href" => field = Some(0),
                b"getetag" => field = Some(1),
                b"resourcetype" => in_rt = true,
                b"collection" if in_rt => {
                    if let Some(c) = cur.as_mut() {
                        c.1 = true;
                    }
                }
                _ => {}
            },
            Ok(Event::Empty(e)) => {
                if e.local_name().as_ref() == b"collection" && in_rt {
                    if let Some(c) = cur.as_mut() {
                        c.1 = true;
                    }
                }
            }
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"response" => {
                    if let Some(c) = cur.take() {
                        out.push(c);
                    }
                }
                b"resourcetype" => in_rt = false,
                b"href" | b"getetag" => {
                    if let Some(c) = cur.as_mut() {
                        c.0 = c.0.trim().to_string();
                        c.2 = c.2.trim().to_string();
                    }
                    field = None
                }
                _ => {}
            },
            Ok(Event::Text(t)) => {
                if let (Some(f), Some(c)) = (field, cur.as_mut()) {
                    let s = t.decode().map_err(|e| e.to_string())?;
                    if f == 0 { c.0.push_str(&s) } else { c.2.push_str(&s) }
                }
            }
            // Entitäten (&quot;, &amp;, &#34; …) liefert quick-xml als eigenes Ereignis
            Ok(Event::GeneralRef(r)) => {
                if let (Some(f), Some(c)) = (field, cur.as_mut()) {
                    let name = r.decode().map_err(|e| e.to_string())?;
                    let ch: String = match r.resolve_char_ref().map_err(|e| e.to_string())? {
                        Some(ch) => ch.to_string(),
                        None => quick_xml::escape::resolve_predefined_entity(&name).ok_or(format!("Unbekannte Entität &{name};"))?.to_string(),
                    };
                    if f == 0 { c.0.push_str(&ch) } else { c.2.push_str(&ch) }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("Ungültige Serverantwort: {e}")),
            _ => {}
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_nextcloud_urls() {
        let d = Dav::new("cloud.example.com/", "Jürgen", "x", "Motorrad/Touren planer").unwrap();
        assert_eq!(d.url("", true), "https://cloud.example.com/remote.php/dav/files/J%C3%BCrgen/Motorrad/Touren%20planer/");
        assert_eq!(d.url("files/a b/x.gpx", false), "https://cloud.example.com/remote.php/dav/files/J%C3%BCrgen/Motorrad/Touren%20planer/files/a%20b/x.gpx");
    }

    #[test]
    fn parses_multistatus() {
        let xml = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>/remote.php/dav/files/u/F/</d:href><d:propstat><d:prop><d:getetag>"abc"</d:getetag><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/files/u/F/db/x%20y.json</d:href><d:propstat><d:prop><d:getetag>&quot;e1&quot;</d:getetag><d:resourcetype/></d:prop></d:propstat></d:response>
</d:multistatus>"#;
        let r = parse_multistatus(xml).unwrap();
        assert_eq!(r.len(), 2);
        assert!(r[0].1);
        assert!(!r[1].1);
        assert_eq!(url_path(&r[1].0), "/remote.php/dav/files/u/F/db/x y.json");
        assert_eq!(clean_etag(&r[1].2), "e1");
    }
}
