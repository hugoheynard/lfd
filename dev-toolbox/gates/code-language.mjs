#!/usr/bin/env node
/**
 * Gate : **les identifiants sont en anglais** (`CLAUDE.md` §8).
 *
 * La prose reste en français — JSDoc, commentaires, messages d'erreur destinés
 * à un humain, libellés d'écran. Ce que ce gate surveille, ce sont les NOMS que
 * le code se donne : types, champs, variables, fonctions.
 *
 * Ce qui a motivé son écriture, c'est moins le français que le **mélange dans
 * un même symbole** :
 *
 * ```ts
 * interface BoutiqueChannels { emporter: boolean; surPlace: boolean }
 * ```
 *
 * Un nom anglais, des membres français. À la lecture, on ne sait plus quelle
 * langue attendre au champ suivant — et on finit par écrire `emporterTvaId`,
 * qui n'est ni l'une ni l'autre.
 *
 * ## Le motif du SCOPE qui grandit
 *
 * Le même que `fold-typography` : les dossiers **drainés** échouent au premier
 * mot français, tout le reste est **compté et affiché**. Taire la dette
 * restante serait pire que de ne pas avoir de gate — on croirait le travail
 * fini. Ajouter un dossier au SCOPE, c'est déclarer l'avoir drainé.
 *
 * ## Deux exceptions, nommées
 *
 * - `mercuriale` n'a pas d'équivalent anglais juste : ce n'est ni un
 *   `priceList`, ni un `catalog`, ni un `quote`. Le DDD demande de garder la
 *   langue du métier quand elle est précise, et une exception ÉCRITE ne dérive
 *   pas — une exception tacite, si.
 * - les **valeurs de données** (`emporter`, `surPlace`, `facturation`) ne sont
 *   pas des identifiants : les renommer est une migration, pas un renommage.
 *   Elles sont donc ignorées entre guillemets ; seuls les NOMS comptent.
 *
 * Usage : `pnpm lint:code-language`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Les dossiers dont la dette est purgée. En ajouter un = l'avoir drainé. */
const SCOPE = [
  "apps/lfd-api/src/pim/commerce",
  "apps/lfd-api/src/pim/locations",
  "apps/lfc-B2B-admin-frontend/src/app/pim/catalogue/vat-rates",
  "apps/lfc-B2B-admin-frontend/src/app/pim/locations",
  // Les paquets partagés, drainés le 2026-08-25. Ce sont les plus petits et les
  // plus lus : une dérive y voyage dans les trois apps à la fois.
  "packages",
];

/**
 * Tout le reste, pour que le solde restant soit visible et non silencieux.
 *
 * ⚠️ `packages/` n'y était pas — huit paquets sur neuf étaient déjà propres,
 * mais personne ne le savait, et `b2b-ui` y portait un `'facturation' |
 * 'livraison'` que rien ne comptait. Un dossier hors liste n'est pas « sans
 * dette » : il est **sans mesure**, ce qui se lit pareil et ne vaut rien.
 */
const WATCHED = [
  "apps/lfd-api/src",
  "apps/lfc-B2B-admin-frontend/src/app",
  "apps/lfc-B2B-platform-frontend/src",
  "packages",
];

/** Le lexique — `documentation/langue-du-code.md` §3. */
const FRENCH = [
  "emplacement",
  "tva",
  "tarif",
  "palier",
  "remise",
  "retrait",
  "livraison",
  "gabarit",
  "conditionnement",
  "boutique",
  "canaux",
  "visuel",
  "gamme",
];

/** Ce qui n'est PAS un identifiant : chaînes, commentaires, imports de chemins. */
function identifiersOnly(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)))
      // Chaînes et gabarits : des VALEURS, pas des noms.
      .replace(/"(?:[^"\\\n]|\\.)*"/g, blank)
      .replace(/'(?:[^'\\\n]|\\.)*'/g, blank)
      .replace(/`(?:[^`\\]|\\.)*`/gs, blank)
  );
}

const FORBIDDEN = new Set(FRENCH);
const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * Un identifiant, découpé en MOTS — `camelCase`, `PascalCase`, `snake_case`.
 *
 * Comparer des sous-chaînes ne marche pas : `firstValueFrom` contient « tVa »,
 * et `programme` contient « gamme ». Deux faux positifs qui auraient appris à
 * ignorer le gate — ce qui est pire que de ne pas en avoir.
 */
function wordsOf(identifier) {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_$]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function findingsIn(file) {
  const found = [];
  identifiersOnly(readFileSync(file, "utf8"))
    .split("\n")
    .forEach((line, i) => {
      for (const match of line.matchAll(IDENTIFIER)) {
        const guilty = wordsOf(match[0]).filter((word) => FORBIDDEN.has(word));
        if (guilty.length > 0) {
          found.push([i + 1, `${match[0]} (${guilty.join(", ")})`]);
        }
      }
    });
  return found;
}

function tsFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    // Le client Prisma est GÉNÉRÉ : ses noms suivent le schéma, pas nous.
    if (entry === "node_modules" || entry === "client") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

let failures = 0;
for (const dir of SCOPE) {
  for (const file of tsFiles(join(ROOT, dir))) {
    for (const [line, word] of findingsIn(file)) {
      if (failures === 0) {
        console.error("\n✗ code-language\n");
      }
      failures += 1;
      console.error(`  ${relative(ROOT, file)}:${line}  identifiant français : ${word}`);
    }
  }
}

const drained = SCOPE.map((d) => join(ROOT, d));
let remaining = 0;
for (const dir of WATCHED) {
  for (const file of tsFiles(join(ROOT, dir))) {
    if (drained.some((d) => file.startsWith(d))) {
      continue;
    }
    remaining += findingsIn(file).length;
  }
}

if (failures) {
  console.error(
    `\n  ${failures} identifiant(s) français dans un dossier drainé.\n` +
      `  Lexique : documentation/langue-du-code.md §3.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ code-language : ${SCOPE.length} dossier(s) drainé(s), 0 identifiant français.\n` +
    `  Hors scope : ${remaining} restants — compté, pas ignoré.`,
);
