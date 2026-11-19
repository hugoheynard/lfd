#!/usr/bin/env node
/**
 * Gate : **une spec front ne joint pas le réseau.**
 *
 * Une spec qui fournit le vrai `HttpClient` (`provideHttpClient()`) sans le
 * faux (`provideHttpClientTesting()`) laisse partir ses requêtes. En CI, rien
 * ne répond et elles échouent sans bruit ; sur un poste où l'API de dev tourne
 * (contournement d'auth actif), elle répond avec une vraie société de la base
 * de dev, et la spec teste cette base au lieu de sa fixture. Quatorze tests de
 * la boutique ont échoué ainsi en local, verts en CI.
 *
 * ## Ce que la porte refuse
 *
 * Dans les `*.spec.ts` des frontends et des paquets : `provideHttpClient(`
 * sans `provideHttpClientTesting(` dans le même fichier.
 *
 * ## La liste admise
 *
 * **ADMITTED** : une spec dont le sujet est un faux serveur (elle remplace
 * elle-même le backend HTTP), avec sa raison. Une entrée qui ne fournit plus
 * le vrai client, ou qui a disparu, échoue.
 *
 * Usage : `pnpm gate spec-http-offline`. Tests :
 * `node --test dev-toolbox/__tests__/spec-http-offline.test.mjs`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOTS = ["apps/lfc-ecommerce-frontend", "apps/lfd-backoffice-frontend", "packages"];

/** Les specs dont le sujet est un faux serveur. */
export const ADMITTED = {
  "apps/lfc-ecommerce-frontend/preview/app/composition/demo-http-backend.spec.ts":
    "le faux serveur de l'aperçu remplace lui-même le backend HTTP : c'est ce qu'elle éprouve",
};

/** Les commentaires peuvent citer les deux providers : on les blanchit. */
export function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

/** La ligne du premier vrai client fourni sans le faux, ou `null`. */
export function onlineAt(raw) {
  const source = withoutComments(raw);
  const real = /\bprovideHttpClient\(/.exec(source);
  if (real === null || /\bprovideHttpClientTesting\(/.test(source)) return null;
  return source.slice(0, real.index).split("\n").length;
}

/** Le verdict, pur. */
export function verdict(files, admitted = {}) {
  const failures = [];
  const seen = new Set();
  for (const { path, source } of files) {
    const line = onlineAt(source);
    if (path in admitted) {
      seen.add(path);
      if (line === null) {
        failures.push(`${path}  admis mais ne fournit plus le vrai client — le retirer d'ADMITTED`);
      }
      continue;
    }
    if (line !== null) {
      failures.push(
        `${path}:${line}  fournit le vrai HttpClient sans provideHttpClientTesting() — ` +
          "ses requêtes partent vers l'API de dev quand elle tourne",
      );
    }
  }
  for (const path of Object.keys(admitted)) {
    if (!seen.has(path)) failures.push(`${path}  admis mais introuvable — corriger ADMITTED`);
  }
  return failures;
}

function specFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...specFiles(full));
    else if (entry.endsWith(".spec.ts")) out.push(full);
  }
  return out;
}

function main() {
  const root = process.cwd();
  const files = ROOTS.flatMap((dir) => specFiles(join(root, dir))).map((full) => ({
    path: relative(root, full).replace(/\\/g, "/"),
    source: readFileSync(full, "utf8"),
  }));
  const failures = verdict(files, ADMITTED);
  if (failures.length > 0) {
    console.error("\n✗ spec-http-offline\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(`\n  ${failures.length} écart(s). Une spec front ne joint pas le réseau.\n`);
    process.exit(1);
  }
  console.log(`✓ spec-http-offline : ${files.length} spec(s) lues, aucune ne joint le réseau.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
