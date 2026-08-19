#!/usr/bin/env node
/**
 * Gate **temporaire** : la copie du schéma PIM ne dérive pas de l'original.
 *
 * `apps/lfd-api/prisma/pim/schema.prisma` est une copie de
 * `apps/lfc-PIM-backend/prisma/schema.prisma`. Elle existe parce que Prisma
 * déclare la sortie du générateur **dans le schéma** : pointer directement celui
 * du PIM écrirait le client chez lui, et il n'y a pas d'option pour la surcharger
 * en ligne de commande.
 *
 * Une duplication de schéma est exactement le genre de dette qui pourrit sans
 * bruit : on ajoute une colonne d'un côté, l'autre client ne la connaît pas, et
 * on ne l'apprend qu'à la première requête en production. Ce gate convertit ce
 * risque silencieux en build rouge.
 *
 * **Il disparaît avec la copie**, à l'étape B2c : le PIM déménage, son schéma
 * devient l'unique, et ce fichier n'a plus d'objet. Un gate temporaire doit dire
 * quand il s'en va, sinon il devient un meuble.
 *
 * Seule différence tolérée : le chemin `output` du générateur, qui est
 * précisément la raison d'être de la copie.
 *
 * Usage : `pnpm lint:pim-schema-parity` (branché en CI).
 */
import { readFileSync } from "node:fs";

const ORIGINAL = "apps/lfc-PIM-backend/prisma/schema.prisma";
const COPY = "apps/lfd-api/prisma/pim/schema.prisma";

/** La ligne `output` du générateur — la seule qui a le droit de différer. */
const OUTPUT = /^\s*output\s*=\s*".*"\s*$/u;

function normalized(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !OUTPUT.test(line))
    .join("\n")
    .trimEnd();
}

const original = normalized(ORIGINAL);
const copy = normalized(COPY);

if (original === copy) {
  console.log("✅ La copie du schéma PIM est fidèle à l'original.");
  process.exit(0);
}

const originalLines = original.split("\n");
const copyLines = copy.split("\n");
const firstDivergence = originalLines.findIndex((line, index) => line !== copyLines[index]);

console.error("\n❌ Les deux schémas PIM ont divergé :\n");
console.error(`   original : ${ORIGINAL}`);
console.error(`   copie    : ${COPY}`);
if (firstDivergence !== -1) {
  console.error(`\n   Première différence, ligne ${String(firstDivergence + 1)} :`);
  console.error(`   − ${originalLines[firstDivergence] ?? "(absente)"}`);
  console.error(`   + ${copyLines[firstDivergence] ?? "(absente)"}`);
} else {
  console.error(
    `\n   La copie a ${String(copyLines.length - originalLines.length)} ligne(s) de plus.`,
  );
}
console.error(
  "\n   Recopier : sed 's|output.*|output = \"../../src/pim/infra/database/client\"|' \\\n" +
    `     ${ORIGINAL} > ${COPY}\n` +
    "   (et regénérer : pnpm --filter lfd-api db:generate)",
);
process.exit(1);
