#!/usr/bin/env node
/**
 * Gate : **un SKU n'est jamais réattribué.**
 *
 * La propriété tient sur deux jambes, et une seule était solide :
 *
 * 1. `Product.sku` et `ProductVariant.sku` sont `@unique` — Postgres refuse un
 *    doublon. **Structurel**, rien à surveiller.
 * 2. Aucune ligne de produit n'est jamais SUPPRIMÉE : un produit s'archive, sa
 *    ligne reste, donc son SKU reste pris. **Conventionnel** — c'était une
 *    phrase du `CLAUDE.md`, et une phrase ne refuse rien.
 *
 * Cette porte tient la seconde. Sans elle, un `prisma.product.delete()` ajouté
 * un soir libère un SKU, et le prochain produit peut le reprendre.
 *
 * ## Pourquoi ça coûte cher, alors qu'aucun écran ne montre jamais ça
 *
 * Le SKU est la clé de tout ce que le référentiel ne possède pas. `OrderLine`
 * le porte en `string` — pas en clé étrangère, c'est un autre contexte —, les
 * paniers récurrents aussi, les brouillons aussi, et le catalogue B2B en fait
 * sa clé primaire. Un SKU réattribué à un AUTRE produit ne casse rien : il
 * fait pire, il rattache silencieusement l'histoire d'un article à un article
 * qui n'est pas lui. Une commande de l'an dernier se met à désigner autre
 * chose, et rien ne le signale.
 *
 * C'est aussi la condition qui permet à une décision commerciale — un prix
 * négocié — de **survivre au retrait** d'un article et de lui être rendue s'il
 * revient. Cette survie n'est sûre que si « revenir » veut dire « le même
 * produit revient », et c'est exactement ce que cette porte garantit.
 *
 * ## Ce qu'elle NE fait pas
 *
 * Elle ne cherche pas toutes les suppressions physiques du dépôt. Le
 * `CLAUDE.md` interdit le DELETE sur un agrégat métier, et cette interdiction
 * plus large est encore tenue par la revue. Ici on ne tient qu'une chose, celle
 * dont dépend l'identité : **produits et déclinaisons**.
 *
 * Usage : `pnpm lint:sku-never-recycled` (branché en CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = "apps/lfd-api/src";
const SCHEMA = "apps/lfd-api/prisma/schema.prisma";

/** Le client Prisma généré n'est pas du code écrit ici — ses exemples de JSDoc non plus. */
const SKIP = new Set(["node_modules", "dist", "client", "coverage"]);

/**
 * Les modèles dont l'identité ne doit jamais être recyclée.
 *
 * Le nom Prisma, tel qu'il s'écrit à l'appel (`prisma.product.delete`).
 */
const PROTECTED = ["product", "productVariant"];

/** `prisma.product.delete(`, `tx.productVariant.deleteMany(`, `this.db.product.delete(` … */
const DELETE_CALL = new RegExp(
  String.raw`\.\s*(${PROTECTED.join("|")})\s*\.\s*(delete|deleteMany)\s*\(`,
  "u",
);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP.has(entry)) {
        yield* walk(path);
      }
    } else if (entry.endsWith(".ts")) {
      yield path;
    }
  }
}

const offenders = [];
for (const file of walk(join(ROOT, SRC))) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (DELETE_CALL.test(line)) {
      offenders.push(`${relative(ROOT, file)}:${String(index + 1)}  ${line.trim()}`);
    }
  });
}

/**
 * L'unicité est l'autre jambe : si elle tombait, la porte ne servirait plus à
 * rien. On la vérifie plutôt que de la supposer — c'est une ligne de schéma, et
 * elle se supprime aussi facilement qu'elle s'ajoute.
 */
const schema = readFileSync(join(ROOT, SCHEMA), "utf8");
const missingUnique = [];
for (const model of ["Product", "ProductVariant"]) {
  const block = schema.match(new RegExp(String.raw`^model ${model} \{[\s\S]*?^\}`, "mu"));
  if (block === null) {
    missingUnique.push(`${model} — modèle introuvable dans le schéma`);
    continue;
  }
  if (!/^\s*sku\s+String\s+@unique/mu.test(block[0])) {
    missingUnique.push(`${model}.sku — l'unicité a disparu du schéma`);
  }
}

if (offenders.length === 0 && missingUnique.length === 0) {
  console.log("✓ sku-never-recycled : aucun SKU ne peut être réattribué.");
  console.log("  · Product.sku et ProductVariant.sku sont @unique");
  console.log("  · aucune suppression physique de produit ni de déclinaison");
  process.exit(0);
}

console.error("\n✖ Un SKU pourrait être réattribué :\n");
for (const entry of missingUnique) {
  console.error(`  ${entry}`);
}
for (const entry of offenders) {
  console.error(`  ${entry}`);
}
console.error(
  [
    "",
    "Un produit s'ARCHIVE, il ne se supprime pas. Sa ligne reste, donc son SKU",
    "reste pris — et c'est ce qui empêche une commande de l'an dernier de se",
    "mettre à désigner un autre article.",
    "",
    "Si le besoin est de faire disparaître un produit d'un écran, c'est un",
    "statut, pas un DELETE.",
    "",
  ].join("\n"),
);
process.exit(1);
