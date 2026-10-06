#!/usr/bin/env node
/**
 * Gate : **toute colonne qui porte une donnée personnelle du staff ou d'un
 * réceptionnaire est au registre — et le registre ne cite que des colonnes qui
 * existent.**
 *
 * ## Le trou que cette porte ferme
 *
 * `documentation/legal/rgpd-livreur.md` a été écrit le 2026-10-06 en ouvrant le
 * schéma à la main. Un inventaire en prose est juste le jour où il est écrit,
 * puis chaque migration qui ajoute un `*_by`, un `photo_key` ou une position
 * le rend faux sans un mot. Le dialogue d'information du livreur (lot suivant)
 * promettra « voici ce qui est enregistré sur vous » : une promesse tirée d'un
 * inventaire périmé est une information inexacte, ce que le RGPD reproche
 * précisément.
 *
 * Le registre machine, `documentation/legal/rgpd-registre.json`, est donc la
 * source ; la porte le confronte au schéma Prisma à chaque exécution.
 *
 * ## Ce qu'elle vérifie
 *
 * 1. Toute colonne CANDIDATE (motifs de nom ci-dessous, `@map` compris) est au
 *    registre, ou dans ses exclusions avec une raison.
 * 2. Toute entrée et toute exclusion nomme une colonne qui existe — un registre
 *    périmé échoue. Le registre peut porter des colonnes que les motifs ne
 *    voient pas (`staff_users.first_name`, `arrived_at`) : elles sont vérifiées
 *    comme existantes, pas comme candidates.
 * 3. Chaque entrée porte ses champs obligatoires, aux valeurs admises, et une
 *    `purge` qui cite un fichier présent.
 * 4. Dès que le texte d'information du livreur a une version, l'empreinte des
 *    entrées `livreur` doit être celle qu'il a vue : ajouter ou recatégoriser
 *    une donnée du livreur exige une nouvelle version du texte. Inerte tant que
 *    `texteInformation.version` est `null`.
 *
 * ## Dette affichée, jamais bloquante
 *
 * Les durées non décidées et les entrées hors du texte d'information sont
 * COMPTÉES à chaque exécution. Elles ne font pas échouer : elles sont l'état
 * réel, et le taire serait pire.
 *
 * Usage : `pnpm lint:rgpd-staff` (branché dans `lint:gates`).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { PRISMA_SCHEMA_DIR, prismaSchemaSource } from "./lib/prisma-schema.mjs";

const ROOT = process.cwd();
const REGISTRY_PATH = "documentation/legal/rgpd-registre.json";

const PERSONS = ["livreur", "staff", "receptionnaire"];
const DURATION_WORDS = ["aucune-limite-decidee", "a-decider"];

/** Motifs valables dans tout schéma : un auteur, un livreur, une preuve. */
const NAME_PATTERNS = [
  /_by$/u,
  /_by_name$/u,
  /_staff_id$/u,
  /^driver_/u,
  /^receiver_name$/u,
  /^photo_key$/u,
  /^signature_key$/u,
];

/**
 * Une position n'est candidate que dans le schéma de la livraison : ailleurs,
 * un `*_lat` serait un point d'adresse ou de dépôt, pas un geste.
 */
const POSITION_PATTERNS = [/_lat$/u, /_lng$/u, /_accuracy_m$/u];
const POSITION_SCHEMA = "delivery";

/** Les colonnes du schéma, `schema.table.colonne`, telles que Postgres les nomme. */
export function columnsOf(source) {
  const columns = [];
  let block = null;
  for (const line of source.split("\n")) {
    if (block === null) {
      const start = /^model\s+(\w+)/u.exec(line);
      if (start !== null) {
        block = { table: start[1], schema: null, fields: [] };
      }
      continue;
    }
    if (line.startsWith("}")) {
      for (const field of block.fields) {
        columns.push(`${block.schema}.${block.table}.${field}`);
      }
      block = null;
      continue;
    }
    readBlockLine(line, block);
  }
  return columns;
}

function readBlockLine(line, block) {
  const trimmed = line.trim();
  const table = /@@map\("([^"]+)"\)/u.exec(trimmed);
  if (table !== null) block.table = table[1];
  const schema = /@@schema\("([^"]+)"\)/u.exec(trimmed);
  if (schema !== null) block.schema = schema[1];
  if (trimmed.startsWith("@@") || trimmed.startsWith("//")) return;
  const field = /^(\w+)\s+(\w+)(\[\])?/u.exec(trimmed);
  // Un champ de relation n'est pas une colonne. Celui qui porte `@relation` est
  // écarté ; le côté inverse (`incidents DeliveryIncident[]`) passe, et c'est
  // sans effet : son nom camelCase ne porte aucun motif candidat, et une
  // entrée du registre qui le citerait serait une erreur qu'on ne voit pas.
  if (field === null || trimmed.includes("@relation")) return;
  const mapped = /@map\("([^"]+)"\)/u.exec(trimmed);
  block.fields.push(mapped === null ? field[1] : mapped[1]);
}

export function isCandidate(qualified) {
  const [schema, , column] = qualified.split(".");
  if (NAME_PATTERNS.some((pattern) => pattern.test(column))) return true;
  return schema === POSITION_SCHEMA && POSITION_PATTERNS.some((p) => p.test(column));
}

/** L'empreinte de ce que le texte d'information dit du livreur. */
export function driverFingerprint(entries) {
  const lines = entries
    .filter((entry) => entry.personne === "livreur")
    .map((entry) => `${entry.colonne}|${entry.categorie}`)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

function entryProblems(entry, root) {
  const where = `registre — ${entry.colonne ?? "(entrée sans colonne)"}`;
  const problems = [];
  for (const key of ["colonne", "categorie", "finalite"]) {
    if (typeof entry[key] !== "string" || entry[key].trim() === "") {
      problems.push(`${where} : champ \`${key}\` manquant ou vide.`);
    }
  }
  if (!PERSONS.includes(entry.personne)) {
    problems.push(`${where} : \`personne\` doit valoir ${PERSONS.join(" | ")}.`);
  }
  const c = entry.conservation;
  const isDays = typeof c === "object" && c !== null && Number.isInteger(c.jours) && c.jours > 0;
  if (!isDays && !DURATION_WORDS.includes(c)) {
    problems.push(
      `${where} : \`conservation\` doit valoir { "jours": N } ou ${DURATION_WORDS.join(" | ")}.`,
    );
  }
  if (!("purge" in entry) || (entry.purge !== null && typeof entry.purge !== "string")) {
    problems.push(`${where} : \`purge\` doit être un chemin ou null.`);
  } else if (typeof entry.purge === "string" && !existsSync(`${root}/${entry.purge}`)) {
    problems.push(`${where} : \`purge\` cite \`${entry.purge}\`, qui n'existe pas.`);
  }
  if (typeof entry.information !== "boolean") {
    problems.push(`${where} : \`information\` doit être true ou false.`);
  }
  return problems;
}

/** Tous les refus, pour un registre et un schéma donnés — pur, testable. */
export function check(registry, source, root = ROOT) {
  const existing = new Set(columnsOf(source));
  const declared = new Map(registry.entrees.map((entry) => [entry.colonne, entry]));
  const excluded = new Set(registry.exclusions.map((exclusion) => exclusion.colonne));
  const problems = [];

  for (const column of [...existing].filter(isCandidate).sort()) {
    if (!declared.has(column) && !excluded.has(column)) {
      problems.push(
        `${column} : colonne candidate absente du registre. Ajouter une entrée ` +
          `{ "colonne": "${column}", "personne", "categorie", "finalite", ` +
          `"conservation", "purge", "information": false } — ou une exclusion avec sa raison.`,
      );
    }
  }
  for (const entry of registry.entrees) {
    problems.push(...entryProblems(entry, root));
    if (typeof entry.colonne === "string" && !existing.has(entry.colonne)) {
      problems.push(`registre — ${entry.colonne} : aucune colonne de ce nom (registre périmé).`);
    }
    if (excluded.has(entry.colonne)) {
      problems.push(`registre — ${entry.colonne} : à la fois entrée et exclusion.`);
    }
  }
  for (const exclusion of registry.exclusions) {
    if (!existing.has(exclusion.colonne)) {
      problems.push(`exclusion — ${exclusion.colonne} : aucune colonne de ce nom (périmée).`);
    }
    if (typeof exclusion.raison !== "string" || exclusion.raison.trim() === "") {
      problems.push(`exclusion — ${exclusion.colonne} : une exclusion sans raison ne se lit pas.`);
    }
  }
  problems.push(...informationTextProblems(registry));
  if (declared.size !== registry.entrees.length) {
    problems.push("registre — une colonne y figure deux fois.");
  }
  return problems;
}

/**
 * 4ᵉ contrôle. Inerte tant que le texte d'information du livreur n'a pas de
 * version : il n'existe pas au 2026-10-06, le lot du dialogue d'information
 * (`documentation/legal/rgpd-livreur.md` §7, point 2) posera `version` et
 * `empreinte`.
 */
function informationTextProblems(registry) {
  const text = registry.texteInformation;
  if (text === undefined || text.version === null) {
    const informed = registry.entrees.filter((entry) => entry.information === true);
    return informed.length === 0
      ? []
      : [
          `texteInformation — ${String(informed.length)} entrée(s) en \`information: true\` ` +
            "sans texte versionné : poser `texteInformation.version` et `empreinte`.",
        ];
  }
  const actual = driverFingerprint(registry.entrees);
  if (text.empreinte === actual) return [];
  return [
    `texteInformation — les données du livreur ont changé depuis la version ` +
      `${String(text.version)} du texte (empreinte ${String(text.empreinte)} → ${actual}). ` +
      "Écrire une nouvelle version du texte d'information, puis reporter l'empreinte.",
  ];
}

function debtLines(registry) {
  const count = (predicate) => registry.entrees.filter(predicate).length;
  return [
    `  · ${String(registry.entrees.length)} entrée(s), ${String(registry.exclusions.length)} exclusion(s)`,
    `  · dette — conservation \`a-decider\` : ${String(count((e) => e.conservation === "a-decider"))}`,
    `  · dette — conservation \`aucune-limite-decidee\` : ${String(count((e) => e.conservation === "aucune-limite-decidee"))}`,
    `  · dette — hors du texte d'information (\`information: false\`) : ${String(count((e) => e.information === false))}`,
  ];
}

function main() {
  const registry = JSON.parse(readFileSync(`${ROOT}/${REGISTRY_PATH}`, "utf8"));
  const problems = check(registry, prismaSchemaSource(ROOT));
  if (problems.length > 0) {
    console.error(`\n❌ Le registre RGPD (${REGISTRY_PATH}) ne dit pas ce que le schéma porte.\n`);
    for (const line of problems) console.error(`   ${line}`);
    console.error(
      `\n   Le registre est lu par le texte d'information du livreur : une colonne\n` +
        `   personnelle qui n'y est pas est une donnée qu'on ne lui a pas annoncée.\n` +
        `   Schéma lu : ${PRISMA_SCHEMA_DIR}.\n`,
    );
    process.exit(1);
  }
  console.log(
    "✓ rgpd-staff : chaque donnée personnelle du staff et des réceptionnaires est au registre.",
  );
  for (const line of debtLines(registry)) console.log(line);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
