#!/usr/bin/env node
/**
 * Gate : **un bloc n'importe un autre bloc que s'il en a le droit.**
 *
 * Aujourd'hui, ce qui empêche le PIM d'importer le moteur de prix du B2B, c'est
 * le **réseau** : les deux vivent dans deux processus. Le jour où ils se
 * rejoignent (cf. `documentation/suite/architecture-topologie-apps.md`, étape
 * B2), ce mur disparaît — et rien ne le remplace tout seul. En six mois,
 * quelqu'un écrit l'import qui traverse, personne ne le voit en revue, et le
 * monolithe modulaire devient une god app.
 *
 * Ce gate est le mur de remplacement. Il est posé **avant** la fusion (étape
 * B1) et pas après, parce qu'un mur qu'on ajoute une fois la brèche ouverte ne
 * ferme plus rien : il ne fait que constater.
 *
 * Ce qu'il vérifie, et rien d'autre : un fichier d'un bloc n'importe un fichier
 * d'un autre bloc que si la matrice l'autorise. Il ne dit rien de la qualité de
 * l'import, ni de son sens — seulement de sa **direction**.
 *
 * Usage : `pnpm lint:context-boundaries` (branché en CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = "apps/lfd-api/src";

/**
 * **À quel bloc appartient chaque dossier de premier niveau.**
 *
 * C'est la seule donnée à tenir à jour : le jour où `pim/` arrive, une ligne
 * suffit. Un dossier absent de cette table fait **échouer** le gate plutôt que
 * d'être ignoré — un nouveau contexte doit choisir son camp, pas se glisser
 * entre les mailles.
 */
const BLOCK_OF = {
  // ▸ LE SOCLE PARTAGÉ — il dit qui est qui et qui peut quoi.
  "staff-users": "staff",
  "staff-notifications": "staff",

  // ▸ LA PLATEFORME MARCHANDE.
  account: "b2b",
  alerts: "b2b",
  catalog: "b2b",
  "delivery-zones": "b2b",
  growth: "b2b",
  "order-cutoffs": "b2b",
  orders: "b2b",
  payments: "b2b",
  "pickup-addresses": "b2b",
  pricing: "b2b",
  subscriptions: "b2b",

  // ▸ LE RÉFÉRENTIEL — arrive en B2c ; son socle de base de données est déjà là.
  pim: "pim",

  // ▸ TECHNIQUE PURE — zéro connaissance métier.
  infra: "platform",
  shared: "platform",
};

/**
 * **Qui a le droit d'importer qui.** Courte exprès : si elle ne tient pas en
 * cinq lignes, le découpage est faux.
 *
 * Les deux lectures qui comptent :
 *
 * - **`staff` ne connaît personne.** S'il connaissait le B2B, on ne pourrait
 *   plus le poser devant le PIM — or c'est précisément ce qu'on veut faire ;
 * - **`platform` ne connaît aucun contexte.** Une brique technique qui sait
 *   qu'un annuaire staff existe n'est plus une brique technique.
 */
const ALLOWED = {
  staff: new Set(["platform"]),
  pim: new Set(["staff", "platform"]),
  b2b: new Set(["staff", "pim", "platform"]),
  platform: new Set([]),
};

/**
 * Les franchissements **connus**, tolérés le temps de l'étape B2.
 *
 * Chacun porte sa raison et sa cible. Une entrée sans raison n'est pas une
 * exception, c'est un oubli — et la liste ne grandit pas : elle se vide.
 */
/**
 * Les franchissements **connus**, tolérés le temps de l'étape B2.
 *
 * Chacun porte sa raison et sa cible. Une entrée sans raison n'est pas une
 * exception, c'est un oubli — et la liste ne grandit pas : elle se vide.
 *
 * Vide depuis le 2026-08-19 : les sept franchissements trouvés à la pose du gate
 * ont tous été résorbés. Une entrée qui réapparaît ici doit donc porter une
 * décision, pas une commodité.
 */
const KNOWN = new Map([]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules" && entry !== "client" && entry !== "dist") {
        yield* walk(path);
      }
    } else if (path.endsWith(".ts")) {
      yield path;
    }
  }
}

/** Le dossier de premier niveau d'un chemin relatif à `SRC`, ou `null` à la racine. */
function topOf(relativePath) {
  const [first, ...rest] = relativePath.split("/");
  return rest.length === 0 ? null : first;
}

/**
 * La cible d'un import relatif, ramenée à un dossier de premier niveau.
 *
 * Les imports de paquets (`@lfd/…`, `@nestjs/…`) ne sont pas concernés : la
 * frontière qu'on tient ici est **interne** à l'application.
 */
function importedTop(fromRelative, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const segments = fromRelative.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") {
      segments.pop();
    } else if (part !== ".") {
      segments.push(part);
    }
  }
  return topOf(segments.join("/"));
}

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;

const unknownDirs = new Set();
const violations = [];
const unusedExceptions = new Set(KNOWN.keys());

for (const absolute of walk(join(ROOT, SRC))) {
  const fromRelative = relative(join(ROOT, SRC), absolute);
  const fromTop = topOf(fromRelative);
  if (fromTop === null) {
    continue;
  }
  const fromBlock = BLOCK_OF[fromTop];
  if (fromBlock === undefined) {
    unknownDirs.add(fromTop);
    continue;
  }

  const source = readFileSync(absolute, "utf8");
  for (const match of source.matchAll(IMPORT)) {
    const toTop = importedTop(fromRelative, match[1]);
    if (toTop === null || toTop === fromTop) {
      continue;
    }
    const toBlock = BLOCK_OF[toTop];
    if (toBlock === undefined) {
      unknownDirs.add(toTop);
      continue;
    }
    if (toBlock === fromBlock || ALLOWED[fromBlock].has(toBlock)) {
      continue;
    }
    const key = `${fromRelative} → ${toTop}`;
    if (KNOWN.has(key)) {
      unusedExceptions.delete(key);
      continue;
    }
    violations.push({ key, fromBlock, toBlock });
  }
}

let failed = false;

if (unknownDirs.size > 0) {
  failed = true;
  console.error("\n❌ Dossiers de premier niveau sans bloc déclaré :\n");
  for (const dir of [...unknownDirs].sort()) {
    console.error(`   ${SRC}/${dir}`);
  }
  console.error("\n   Un nouveau contexte choisit son camp : ajoute-le à BLOCK_OF.");
}

if (violations.length > 0) {
  failed = true;
  console.error("\n❌ Franchissements de frontière :\n");
  for (const { key, fromBlock, toBlock } of violations) {
    console.error(`   ${key}\n      ${fromBlock} → ${toBlock} : interdit par la matrice.`);
  }
  console.error(
    "\n   Le franchissement passe par un PORT déclaré chez l'appelant, jamais par un import direct.",
  );
}

if (unusedExceptions.size > 0) {
  failed = true;
  console.error("\n❌ Exceptions devenues inutiles — la liste doit se vider, pas mentir :\n");
  for (const key of unusedExceptions) {
    console.error(`   ${key}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  KNOWN.size === 0
    ? "✅ Frontières de contexte tenues, sans aucune exception."
    : `✅ Frontières de contexte tenues (${String(KNOWN.size)} exception(s) connue(s) à résorber).`,
);
