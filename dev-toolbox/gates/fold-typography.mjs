#!/usr/bin/env node
/**
 * Gate : la typographie et les couleurs passent par les tokens fold.
 *
 * Sans lui, le travail de remise sur les tokens se re-dégrade en six mois. Le
 * motif « petit titre en capitales » était réécrit dans six fichiers avec cinq
 * tailles différentes ; personne ne remarque un écart de 0,03rem entre deux
 * écrans, et c'est exactement le problème — le système se dissout par des
 * différences invisibles une par une, que tout le monde ressent en parcourant
 * l'app.
 *
 * Trois interdits dans les dossiers DRAINÉS (voir `SCOPE`) :
 *
 * 1. `font-size` / `font-weight` / `line-height` / `letter-spacing` littéral →
 *    `--fold-text-*` / `--fold-weight-*` / `--fold-leading-*` /
 *    `--fold-tracking-*`.
 * 2. `var(--fold-…, repli)` → le repli documente ce que l'auteur CROIT que vaut
 *    le token, et il s'est trompé trois fois sur cinq. Un token fold qui ne
 *    résout pas est un bug de chargement, pas un cas à couvrir : un repli le
 *    masque au lieu de le signaler, et deux replis renvoyaient carrément sur du
 *    gris Tailwind — un AUTRE design system.
 * 3. couleur littérale (`#hex`, `rgb()`, `hsl()`) → un rôle sémantique.
 *
 * Deux exceptions, chacune pour une raison :
 *
 * - une taille en `em` est RELATIVE à son contexte. Du monospace rend
 *   optiquement plus gros à px égal, donc `code { font-size: 0.85em }` se
 *   dimensionne par rapport au texte qui l'entoure : aucun token absolu ne
 *   l'exprime. Même nature que le carve-out `clamp()` de fold-ng.
 * - une ligne commentée juste au-dessus vaut justification pour une couleur
 *   littérale — il en existe de légitimes (une ombre de marque, un dégradé
 *   décoratif), à condition que quelqu'un ait écrit pourquoi.
 *
 * SCOPE est une liste qui GRANDIT. Le reste de l'app porte encore 443
 * littéraux typographiques ; les taire serait pire que de ne pas avoir de
 * gate, donc ils sont comptés et affichés à chaque exécution.
 *
 * Usage : `pnpm lint:fold-typography`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Les dossiers dont la dette est purgée. En ajouter un = l'avoir drainé. */
const SCOPE = ["apps/lfc-B2B-admin-frontend/src/app/pim"];

/** Tout le reste, pour que le solde restant soit visible et non silencieux. */
const WATCHED = [
  "apps/lfc-B2B-admin-frontend/src/app",
  "apps/lfc-B2B-platform-frontend/src",
  "packages/b2b-ui/src",
];

const TYPO = /\b(font-size|font-weight|line-height|letter-spacing)\s*:\s*([^;{}]+)/;
const FALLBACK = /var\(\s*--fold-[\w-]+\s*,/;
const COLOUR = /#[0-9a-fA-F]{3,8}\b|(?<![\w-])rgba?\(|hsla?\(/;
/** Une valeur sans chiffre est une indirection (`var(…)`, une variable Sass). */
const HAS_NUMBER = /\d/;
/** Une taille relative à son contexte : aucun token absolu ne l'exprime. */
const RELATIVE = /^[\d.]+em$/;

/** Neutralise les commentaires en préservant les sauts de ligne. */
function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

function scssFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...scssFiles(full));
    } else if (entry.endsWith(".scss")) {
      out.push(full);
    }
  }
  return out;
}

function findingsIn(file) {
  const found = [];
  const raw = readFileSync(file, "utf8").split("\n");
  const lines = withoutComments(raw.join("\n")).split("\n");
  lines.forEach((line, i) => {
    const typo = TYPO.exec(line);
    if (typo) {
      const value = typo[2].replace(/var\([^)]*\)/g, "").trim();
      if (HAS_NUMBER.test(value) && !RELATIVE.test(value)) {
        found.push([i + 1, `${typo[1]} littéral : ${value}`]);
      }
    }
    if (FALLBACK.test(line)) {
      found.push([i + 1, `repli de var() : ${line.trim()}`]);
    }
    if (COLOUR.test(line) && !/\/\*/.test(raw[i - 1] ?? "")) {
      found.push([i + 1, `couleur littérale : ${line.trim()}`]);
    }
  });
  return found;
}

let failures = 0;
for (const dir of SCOPE) {
  for (const file of scssFiles(join(ROOT, dir))) {
    for (const [line, message] of findingsIn(file)) {
      if (failures === 0) {
        console.error("\n✗ fold-typography\n");
      }
      failures += 1;
      console.error(`  ${relative(ROOT, file)}:${line}  ${message}`);
    }
  }
}

const drained = new Set(SCOPE.map((d) => join(ROOT, d)));
let remaining = 0;
for (const dir of WATCHED) {
  for (const file of scssFiles(join(ROOT, dir))) {
    if ([...drained].some((d) => file.startsWith(d))) {
      continue;
    }
    remaining += findingsIn(file).length;
  }
}

if (failures) {
  console.error(
    `\n  ${failures} littéral(aux) dans un dossier drainé. Nommer le token, ou drainer le dossier avant de l'ajouter au SCOPE.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ fold-typography : ${SCOPE.length} dossier(s) drainé(s), 0 littéral.\n` +
    `  Hors scope : ${remaining} restants — compté, pas ignoré.`,
);
