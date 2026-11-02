#!/usr/bin/env node
// Erzeugt die Lizenzhinweise aller Komponenten, die mit der App ausgeliefert werden:
//
//   THIRD_PARTY_LICENSES.md          vollständige Lizenztexte (für das Repository und die App)
//   src/generated/third-party.json   Kurzliste (Name, Version, Lizenz, Quelle) für das Info-Fenster
//
//   npm run licenses
//
// Erfasst werden die npm-Pakete ohne Entwicklungswerkzeuge sowie alle Rust-Crates, die für
// macOS, Windows oder Linux in die App kompiliert werden (cargo tree -e normal --target all).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(p, "utf8");

/** Lizenzdateien eines Paketordners; bei „MIT OR …“ genügt der MIT-Text. */
function licenseFiles(dir, spdx) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice|unlicense)/i.test(f));
  const notice = files.filter((f) => /^notice/i.test(f));
  const texts = files.filter((f) => !/^notice/i.test(f));
  const mitChoice = /\bMIT\b/.test(spdx) && /\bOR\b|\//.test(spdx);
  const mit = texts.filter((f) => /mit/i.test(f));
  const chosen = mitChoice && mit.length ? mit : texts;
  return [...chosen, ...notice].map((f) => join(dir, f));
}

const clean = (s) => s.replace(/\r\n/g, "\n").trim();
const normalizeSpdx = (s) => (s || "UNKNOWN").replace(/\s*\/\s*/g, " OR ");

// ---------- npm ----------
const lock = JSON.parse(read(join(root, "package-lock.json")));
const npm = Object.entries(lock.packages)
  .filter(([p, v]) => p && !v.dev && !v.devOptional)
  .map(([p]) => {
    const dir = join(root, p);
    const pj = JSON.parse(read(join(dir, "package.json")));
    const license = normalizeSpdx(pj.license ?? pj.licenses?.map((l) => l.type).join(" OR "));
    const repo = typeof pj.repository === "string" ? pj.repository : pj.repository?.url;
    return { kind: "npm", name: pj.name, version: pj.version, license, url: pj.homepage || repo || `https://www.npmjs.com/package/${pj.name}`, files: licenseFiles(dir, license) };
  });

// ---------- Rust ----------
const manifest = join(root, "src-tauri", "Cargo.toml");
const tree = execFileSync("cargo", ["tree", "--manifest-path", manifest, "-e", "normal", "--target", "all", "--prefix", "none", "--format", "{p}"], { encoding: "utf8" });
const wanted = new Set(
  tree
    .split("\n")
    .map((l) => l.replace(/ \(.*\)$/, "").trim())
    .filter(Boolean)
    .map((l) => l.split(" ").slice(0, 2).join(" ")),
);
const meta = JSON.parse(execFileSync("cargo", ["metadata", "--manifest-path", manifest, "--format-version", "1"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const rust = meta.packages
  .filter((p) => p.name !== "tourenplaner" && wanted.has(`${p.name} v${p.version}`))
  .map((p) => {
    const license = normalizeSpdx(p.license);
    const dir = dirname(p.manifest_path);
    const files = licenseFiles(dir, license);
    if (p.license_file) files.unshift(join(dir, p.license_file));
    return { kind: "crate", name: p.name, version: p.version, license, url: p.repository || p.homepage || `https://crates.io/crates/${p.name}`, files: [...new Set(files)] };
  });

const all = [...npm, ...rust].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

// ---------- Ausgabe ----------
const byLicense = {};
for (const p of all) byLicense[p.license] = (byLicense[p.license] ?? 0) + 1;

const lines = [
  "# Lizenzen der verwendeten Komponenten",
  "",
  "Der Tourenplaner selbst steht unter der MIT-Lizenz (siehe `LICENSE`).",
  "Er enthält die folgenden Komponenten anderer Autorinnen und Autoren. Ihre Lizenzen erlauben die Weitergabe",
  "unter der Bedingung, dass die Copyright- und Lizenzhinweise mitgeliefert werden – das geschieht mit dieser Datei,",
  "die auch in der App unter „Über Tourenplaner → Lizenzen der Komponenten“ angezeigt wird.",
  "",
  "Bei Paketen mit Wahlmöglichkeit (z. B. „MIT OR Apache-2.0“) wird die MIT-Lizenz genutzt.",
  "Pakete unter MPL-2.0 werden unverändert verwendet; ihr Quellcode ist unter der angegebenen Adresse erhältlich.",
  "",
  "Diese Datei wird mit `npm run licenses` erzeugt – bitte nicht von Hand bearbeiten.",
  "",
  "## Übersicht",
  "",
  `${npm.length} npm-Pakete (Oberfläche) und ${rust.length} Rust-Crates (Desktop-Hülle).`,
  "",
  "| Lizenz | Anzahl |",
  "| --- | --- |",
  ...Object.entries(byLicense)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `| ${l} | ${n} |`),
  "",
  "## Komponenten",
  "",
];
const missing = [];
for (const p of all) {
  lines.push(`### ${p.name} ${p.version}`, "", `- Lizenz: ${p.license}`, `- Quelle: ${p.url}`, `- Art: ${p.kind === "npm" ? "npm-Paket" : "Rust-Crate"}`, "");
  if (!p.files.length) {
    missing.push(p);
    lines.push("Im Paket ist keine Lizenzdatei enthalten; es gilt der Standardtext im Anhang.", "");
    continue;
  }
  for (const f of p.files) lines.push("```text", clean(read(f)).replace(/```/g, "ʼʼʼ"), "```", "");
}

// Standardtexte für Pakete ohne eigene Lizenzdatei: bei Wahlmöglichkeit MIT, sonst die angegebene Lizenz
const STANDARD = ["MIT", "BSD-3-Clause", "MPL-2.0"];
const pick = (spdx) => STANDARD.find((id) => new RegExp(`\\b${id.replace(/[.-]/g, "\\$&")}\\b`).test(spdx));
if (missing.length) {
  lines.push("## Anhang: Standardlizenztexte", "");
  for (const id of STANDARD) {
    const users = missing.filter((p) => pick(p.license) === id);
    if (!users.length) continue;
    lines.push(`### ${id}`, "", `Gilt für: ${users.map((p) => `${p.name} ${p.version}`).join(", ")}`, "");
    lines.push("```text", clean(read(join(root, "scripts", "licenses", `${id}.txt`))), "```", "");
  }
  const unmatched = missing.filter((p) => !pick(p.license));
  if (unmatched.length) throw new Error(`Kein Standardtext für: ${unmatched.map((p) => `${p.name} (${p.license})`).join(", ")}`);
}

writeFileSync(join(root, "THIRD_PARTY_LICENSES.md"), `${lines.join("\n")}\n`);
mkdirSync(join(root, "src", "generated"), { recursive: true });
writeFileSync(
  join(root, "src", "generated", "third-party.json"),
  `${JSON.stringify(
    all.map(({ kind, name, version, license, url }) => ({ kind, name, version, license, url })),
    null,
    1,
  )}\n`,
);

console.log(`${all.length} Komponenten (${npm.length} npm, ${rust.length} Rust), ${missing.length} ohne eigene Lizenzdatei:`);
for (const p of missing) console.log(`  - ${p.name} ${p.version} (${p.license})`);
console.log("Lizenzen:", byLicense);
