#!/usr/bin/env node
/**
 * Gate : **aucun fichier du référentiel au-delà de 300 lignes**
 * (`documentation/pim/architecture-du-referentiel.md`, L0 ; CLAUDE.md § 6,
 * « fichiers ≲300 lignes »).
 *
 * Elle tient la taille pendant que les autres lots avancent : un fichier qui
 * franchit le seuil échoue, sauf s'il est **admis** (liste datée, avec sa
 * raison : sa taille est sa nature) ou **inscrit en dette** à sa taille
 * relevée. La dette ne peut que décroître : un fichier qui grossit au-delà de
 * sa ligne échoue, un fichier qui a maigri doit voir sa ligne baisser, et un
 * fichier repassé sous le seuil doit en sortir.
 *
 * Les tests (`__tests__/`) ne sont pas comptés : une suite longue n'est pas
 * une unité de code qui porte trop de raisons de changer.
 *
 * Usage : `pnpm gate pim-file-size`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PIM = "apps/lfd-api/src/pim";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DEBT_FILE = join(HERE, "pim-file-size-debt.json");
export const LIMIT = 300;

/** Le nombre de lignes, au sens de `wc -l`. */
export function lineCount(source) {
  const newlines = source.split("\n").length - 1;
  return source.endsWith("\n") || source.length === 0 ? newlines : newlines + 1;
}

/**
 * Le verdict. `sizes` : `Map<chemin sous pim/, lignes>` ; `debt` :
 * `{ admitted: { chemin: { since, reason } }, files: { chemin: lignes } }`.
 */
export function verdict(sizes, debt) {
  const failures = [];
  const admitted = debt.admitted ?? {};
  const inscribed = debt.files ?? {};
  for (const [path, entry] of Object.entries(admitted)) {
    if (!entry.since || !entry.reason) failures.push(`  ${path}  admis sans date ni raison`);
    if (!sizes.has(path)) failures.push(`  ${path}  admis mais absent — retire-le de la liste`);
  }
  for (const [path, lines] of sizes) {
    if (lines <= LIMIT || path in admitted) continue;
    const allowed = inscribed[path];
    if (allowed === undefined) {
      failures.push(
        `  ${path}  ${lines} lignes (> ${LIMIT}) — découpe-le : une raison de changer par fichier`,
      );
    } else if (lines > allowed) {
      failures.push(
        `  ${path}  ${lines} lignes, la dette en admet ${allowed} — il ne grossit plus : découpe avant d'ajouter`,
      );
    }
  }
  for (const [path, allowed] of Object.entries(inscribed)) {
    const lines = sizes.get(path);
    if (lines === undefined || lines <= LIMIT) {
      failures.push(`  ${path}  ne dépasse plus (ou n'existe plus) — retire-le de la dette`);
    } else if (lines < allowed) {
      failures.push(`  ${path}  ${lines} lignes, la dette en compte ${allowed} — baisse la ligne`);
    }
  }
  return failures;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function main() {
  const root = join(process.cwd(), PIM);
  const sizes = new Map(
    sourceFiles(root).map((file) => [
      relative(root, file).split("\\").join("/"),
      lineCount(readFileSync(file, "utf8")),
    ]),
  );
  const debt = JSON.parse(readFileSync(DEBT_FILE, "utf8"));
  const failures = verdict(sizes, debt);
  if (failures.length > 0) {
    console.error(`\n✗ pim-file-size\n\n${failures.join("\n")}\n`);
    process.exit(1);
  }
  const owed = Object.keys(debt.files ?? {}).length;
  console.log(
    `✓ pim-file-size : rien ne grossit au-delà de ${LIMIT} lignes — dette : ${owed} fichiers.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
