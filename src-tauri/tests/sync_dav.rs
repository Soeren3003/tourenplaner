//! Integrationstest gegen einen echten WebDAV-Server.
//! Läuft nur, wenn TOURENPLANER_TEST_DAV gesetzt ist, z. B.:
//!   TOURENPLANER_TEST_DAV=http://127.0.0.1:8765 cargo test --test sync_dav

use tourenplaner_lib::{sync, webdav::Dav};
use std::fs;
use std::path::{Path, PathBuf};

fn tmp(name: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!("tourenplaner-test-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&p);
    fs::create_dir_all(&p).unwrap();
    p
}

fn write(root: &Path, rel: &str, data: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, data).unwrap();
}

fn read(root: &Path, rel: &str) -> Option<String> {
    fs::read_to_string(root.join(rel)).ok()
}

#[tokio::test]
async fn two_devices_sync_via_webdav() {
    let Ok(url) = std::env::var("TOURENPLANER_TEST_DAV") else {
        eprintln!("TOURENPLANER_TEST_DAV nicht gesetzt – übersprungen");
        return;
    };
    let folder = format!("Tourenplaner Test {}", std::process::id());
    let dav = Dav::new(&url, "test", "pw", &folder).unwrap();
    let id = "test";
    let (a, b) = (tmp("a"), tmp("b"));
    let p1 = "db/tours/p1.json";
    let file = "files/p1/Buchung Hütte ä ü.pdf";

    // 1) A legt Tour und Datei an
    write(&a, p1, r#"{"id":"p1","updatedAt":"2026-01-01","title":"A"}"#);
    write(&a, file, "pdf-inhalt");
    let r = sync::run(&a, &dav, id).await.unwrap();
    assert_eq!((r.uploaded, r.errors.len()), (2, 0), "{r:?}");

    // 2) B holt alles
    let r = sync::run(&b, &dav, id).await.unwrap();
    assert_eq!(r.downloaded, 2, "{r:?}");
    assert_eq!(read(&b, file).as_deref(), Some("pdf-inhalt"));

    // 3) Ohne Änderungen passiert nichts
    let r = sync::run(&a, &dav, id).await.unwrap();
    assert_eq!(r.uploaded + r.downloaded + r.deleted_local + r.deleted_remote, 0, "{r:?}");

    // 4) Änderung auf B kommt bei A an
    write(&b, p1, r#"{"id":"p1","updatedAt":"2026-01-02","title":"B geändert"}"#);
    assert_eq!(sync::run(&b, &dav, id).await.unwrap().uploaded, 1);
    assert_eq!(sync::run(&a, &dav, id).await.unwrap().downloaded, 1);
    assert!(read(&a, p1).unwrap().contains("B geändert"));

    // 5) Löschen auf A wird auf B übernommen
    fs::remove_file(a.join(file)).unwrap();
    assert_eq!(sync::run(&a, &dav, id).await.unwrap().deleted_remote, 1);
    assert_eq!(sync::run(&b, &dav, id).await.unwrap().deleted_local, 1);
    assert!(read(&b, file).is_none());

    // 6) Konflikt: beide ändern, der neuere Stand (B) gewinnt
    write(&a, p1, r#"{"id":"p1","updatedAt":"2026-01-03","title":"A alt"}"#);
    write(&b, p1, r#"{"id":"p1","updatedAt":"2026-01-04","title":"B neu!"}"#);
    sync::run(&a, &dav, id).await.unwrap();
    let r = sync::run(&b, &dav, id).await.unwrap();
    assert_eq!(r.conflicts, vec![p1.to_string()], "{r:?}");
    assert!(read(&b, p1).unwrap().contains("B neu!"));
    let copies: Vec<_> = fs::read_dir(b.join(sync::CONFLICT_DIR)).unwrap().collect();
    assert_eq!(copies.len(), 1);
    sync::run(&a, &dav, id).await.unwrap();
    assert!(read(&a, p1).unwrap().contains("B neu!"));

    // 7) Neuer, leerer Datenordner löscht nichts auf dem Server
    let c = tmp("c");
    let r = sync::run(&c, &dav, id).await.unwrap();
    assert_eq!((r.downloaded, r.deleted_remote), (1, 0), "{r:?}");

    for d in [a, b, c] {
        let _ = fs::remove_dir_all(d);
    }
}
