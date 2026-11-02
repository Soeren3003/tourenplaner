#!/usr/bin/env node
// Setzt die Versionsnummer überall gleich: package.json, package-lock.json,
// src-tauri/Cargo.toml, src-tauri/Cargo.lock und src-tauri/tauri.conf.json.
//
//   npm run set-version -- 1.2.0

import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Aufruf: npm run set-version -- <MAJOR.MINOR.PATCH>, z. B. 1.2.0");
  process.exit(1);
}

const edit = (file, fn) => {
  const before = readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`${file}: Versionsnummer nicht gefunden`);
  writeFileSync(file, after);
  console.log(`${file} → ${version}`);
};

const json = (file, fn) =>
  edit(file, (s) => {
    const d = JSON.parse(s);
    fn(d);
    return `${JSON.stringify(d, null, 2)}\n`;
  });

json("package.json", (d) => (d.version = version));
json("package-lock.json", (d) => {
  d.version = version;
  d.packages[""].version = version;
});
json("src-tauri/tauri.conf.json", (d) => (d.version = version));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${version}"`));
edit("src-tauri/Cargo.lock", (s) => s.replace(/(name = "tourenplaner"\nversion = )"[^"]+"/, `$1"${version}"`));
