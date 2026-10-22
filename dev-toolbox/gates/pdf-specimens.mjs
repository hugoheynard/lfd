#!/usr/bin/env node
/**
 * Gate : **tout PDF que le système produit a son exemple sur la planche des
 * documents** (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Hugo, 2026-10-22 : la planche est « un élément névralgique pour contrôler ce
 * qu'on produit comme documents ». Un document qui n'y figure pas ne se
 * contrôle qu'en le provoquant pour de vrai — une commande, une tournée, une
 * facture —, c'est-à-dire jamais avant qu'un client le reçoive.
 *
 * ## Ce que la porte appelle un document
 *
 * Une fonction exportée `render…Pdf` ou `render…Document` du code de
 * production. Pour qu'aucun document n'échappe à ce nom, la porte refuse aussi
 * tout fichier qui ouvre un PDF — `render(` du kit papier, ou
 * `new PDFDocument(` — sans exporter une telle fonction.
 *
 * ## Ce que la porte appelle « sur la planche »
 *
 * Un document est couvert quand un handler d'exemple
 * (`…/application/queries/*specimen*.handler.ts`) l'appelle. Un document qui
 * n'est qu'une **brique** d'un autre — le PDF Factur-X que la facture
 * enveloppe — est couvert quand tous les fichiers qui l'appellent définissent
 * un document couvert : son rendu se voit à travers celui-là.
 *
 * ## La dette, comptée et décroissante
 *
 * Au 2026-10-22, cinq documents n'avaient pas d'exemple. Ils sont inscrits
 * ci-dessous : un document hors liste sans exemple échoue, et un document
 * inscrit qui a reçu son exemple — ou qui a disparu — échoue aussi, pour que la
 * liste ne fasse que se vider.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(ROOT, "apps", "lfd-api", "src");
const KIT = "platform/pdf/paper-pdf-kit.ts";

/** Les documents sans exemple au 2026-10-22 — la liste ne peut que se vider. */
const DEBT = new Set([
  "renderSepaMandatePdf",
  "renderOrderSummaryPdf",
  "renderProductionCountPdf",
  "renderAllergenMatrixPdf",
  "renderDayDossierPdf",
]);

const DOCUMENT = /^export\s+(?:async\s+)?function\s+(render\w*(?:Pdf|Document))\b/gm;
const OPENS_PDF =
  /\bnew\s+PDFDocument\s*\(|^\s*(?:return\s+|const\s+\w+\s*=\s*)?(?:await\s+)?render\s*\(/m;
const SPECIMEN = /\/application\/queries\/[^/]*specimen[^/]*\.handler\.ts$/;

/** Tous les `.ts` de production sous `src`, les `__tests__/` exclus. */
function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "client") {
        yield* sources(full);
      }
    } else if (entry.endsWith(".ts")) {
      yield full;
    }
  }
}

const files = [...sources(SRC)].map((full) => ({
  path: relative(SRC, full).split(sep).join("/"),
  text: readFileSync(full, "utf8"),
}));

/** Nom du document → fichier qui le définit. */
const documents = new Map();
const unnamed = [];
for (const file of files) {
  // Un `…Document` n'est un PDF que si son fichier en ouvre un : le pain.008
  // s'appelle aussi `renderPain008Document`, et c'est du XML.
  const opens = OPENS_PDF.test(file.text);
  const names = [...file.text.matchAll(DOCUMENT)]
    .map((match) => match[1])
    .filter((name) => name.endsWith("Pdf") || opens);
  for (const name of names) {
    documents.set(name, file.path);
  }
  if (file.path !== KIT && names.length === 0 && opens && /pdf/i.test(file.path)) {
    unnamed.push(file.path);
  }
}

/** Les fichiers (hors le sien) qui appellent ce document. */
function callersOf(name, home) {
  const call = new RegExp(`\\b${name}\\s*\\(`);
  return files
    .filter((file) => file.path !== home && call.test(file.text))
    .map((file) => file.path);
}

const covered = new Set();
let grew = true;
while (grew) {
  grew = false;
  for (const [name, home] of documents) {
    if (covered.has(name)) {
      continue;
    }
    const callers = callersOf(name, home);
    const bySpecimen = callers.some((path) => SPECIMEN.test(`/${path}`));
    const byCoveredDocument =
      callers.length > 0 &&
      callers.every((path) =>
        [...documents].some(([other, otherHome]) => otherHome === path && covered.has(other)),
      );
    if (bySpecimen || byCoveredDocument) {
      covered.add(name);
      grew = true;
    }
  }
}

/** Une brique dont tous les appelants sont des documents inscrits en dette. */
function brickOfDebt(name, home) {
  const callers = callersOf(name, home);
  return (
    callers.length > 0 &&
    callers.every((path) =>
      [...documents].some(([other, otherHome]) => otherHome === path && DEBT.has(other)),
    )
  );
}

const missing = [...documents].filter(
  ([name, home]) => !covered.has(name) && !DEBT.has(name) && !brickOfDebt(name, home),
);
const stale = [...DEBT].filter((name) => !documents.has(name) || covered.has(name));

if (unnamed.length > 0 || missing.length > 0 || stale.length > 0) {
  console.error("\n✗ pdf-specimens\n");
  for (const path of unnamed) {
    console.error(
      `  ${path}  ouvre un PDF sans exporter de fonction render…Pdf — nommez le document`,
    );
  }
  for (const [name, home] of missing) {
    console.error(`  ${home}  ${name} n'a pas d'exemple sur la planche des documents`);
  }
  for (const name of stale) {
    console.error(
      `  ${name}  est inscrit en dette mais a son exemple, ou n'existe plus — retirez-le de la liste`,
    );
  }
  console.error(
    "\n  Un document absent de la planche ne se contrôle qu'en le produisant pour\n" +
      "  de vrai. Ajoutez un handler `…/application/queries/*specimen*.handler.ts`\n" +
      "  qui l'appelle avec des données d'exemple, et sa vignette sur la planche.\n",
  );
  process.exit(1);
}

console.log(
  `✓ pdf-specimens : ${String(covered.size)} document(s) sur la planche ; ` +
    `${String(DEBT.size)} sans exemple — compté, en baisse seulement.`,
);
