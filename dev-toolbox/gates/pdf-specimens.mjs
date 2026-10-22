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
 * Un document est couvert quand on peut le VOIR : un handler d'exemple
 * (`…/application/queries/*specimen*.handler.ts`) l'appelle, une route
 * `admin/document-specimens/<clé>.pdf` sert la requête de ce handler, et la
 * page range cette clé dans `SPECIMEN_GROUPS`. Hugo, le même jour : un exemple
 * servi par l'API mais absent de la page ne se regarde pas. Une vignette sans
 * route échoue aussi : elle resterait vide. Un document qui
 * n'est qu'une **brique** d'un autre — le PDF Factur-X que la facture
 * enveloppe — est couvert quand tous les fichiers qui l'appellent définissent
 * un document couvert : son rendu se voit à travers celui-là.
 *
 * ## Plus de dette
 *
 * Au 2026-10-22 au matin, cinq documents n'avaient pas d'exemple ; le soir
 * même, tous l'avaient. Il n'y a plus de liste d'exception : un document sans
 * exemple échoue, sans recours.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(ROOT, "apps", "lfd-api", "src");
const KIT = "platform/pdf/paper-pdf-kit.ts";

const DOCUMENT = /^export\s+(?:async\s+)?function\s+(render\w*(?:Pdf|Document))\b/gm;
const OPENS_PDF =
  /\bnew\s+PDFDocument\s*\(|^\s*(?:return\s+|const\s+\w+\s*=\s*)?(?:await\s+)?render\s*\(/m;
const SPECIMEN = /\/application\/queries\/[^/]*specimen[^/]*\.handler\.ts$/;
const SCREEN_CATALOGUE = join(
  ROOT,
  "apps/lfd-backoffice-frontend/src/app/comptabilite/document-specimen-catalogue.ts",
);
const ROUTE_PREFIX = '@Controller("admin/document-specimens")';

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

/** Les clés que la page montre : celles rangées dans `SPECIMEN_GROUPS`. */
function screenKeys() {
  const text = readFileSync(SCREEN_CATALOGUE, "utf8");
  const groups = text.slice(text.indexOf("SPECIMEN_GROUPS"));
  return new Set(
    [...groups.matchAll(/group\([^,]+,\s*\[([^\]]*)\]/g)].flatMap((match) =>
      [...match[1].matchAll(/'([^']+)'/g)].map((key) => key[1]),
    ),
  );
}

/** Requête d'exemple → les routes `admin/document-specimens/<clé>.pdf` qui la servent. */
function routesByQuery() {
  const routes = new Map();
  for (const file of files.filter((candidate) => candidate.text.includes(ROUTE_PREFIX))) {
    const methods = file.text.split(/(?=@Get\()/).slice(1);
    for (const method of methods) {
      const key = /@Get\("([^"]+)\.pdf"\)/.exec(method)?.[1];
      for (const query of method.matchAll(/new\s+(\w+Query)\s*\(/g)) {
        if (key !== undefined) {
          routes.set(query[1], [...(routes.get(query[1]) ?? []), key]);
        }
      }
    }
  }
  return routes;
}

const shown = screenKeys();
const routes = routesByQuery();
const servedKeys = new Set([...routes.values()].flat());

/** Un handler d'exemple dont une route est montrée par la page. */
function specimenOnScreen(path) {
  const text = files.find((file) => file.path === path)?.text ?? "";
  const query = /@QueryHandler\((\w+)\)/.exec(text)?.[1];
  return query !== undefined && (routes.get(query) ?? []).some((key) => shown.has(key));
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
    const bySpecimen = callers.some((path) => SPECIMEN.test(`/${path}`) && specimenOnScreen(path));
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

const missing = [...documents].filter(([name]) => !covered.has(name));
// L'autre sens : une vignette dont aucune route ne sert le PDF reste vide.
const orphanKeys = [...shown].filter((key) => !servedKeys.has(key));

if (unnamed.length > 0 || missing.length > 0 || orphanKeys.length > 0) {
  console.error("\n✗ pdf-specimens\n");
  for (const key of orphanKeys) {
    console.error(
      `  la planche montre « ${key} », qu'aucune route admin/document-specimens ne sert`,
    );
  }
  for (const path of unnamed) {
    console.error(
      `  ${path}  ouvre un PDF sans exporter de fonction render…Pdf — nommez le document`,
    );
  }
  for (const [name, home] of missing) {
    console.error(`  ${home}  ${name} n'a pas d'exemple visible sur la planche des documents`);
  }
  console.error(
    "\n  Un document absent de la planche ne se contrôle qu'en le produisant pour\n" +
      "  de vrai. Il lui faut les trois : un handler\n" +
      "  `…/application/queries/*specimen*.handler.ts` qui l'appelle avec des données\n" +
      "  d'exemple, une route `admin/document-specimens/<clé>.pdf` qui le sert, et la\n" +
      "  clé dans `SPECIMEN_GROUPS` (`document-specimen-catalogue.ts`).\n",
  );
  process.exit(1);
}

console.log(
  `✓ pdf-specimens : ${String(covered.size)} document(s) sur la planche ; ` + "aucun sans exemple.",
);
