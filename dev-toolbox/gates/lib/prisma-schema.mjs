/**
 * **Le schéma Prisma tel que Prisma le voit**, pour les portes qui le lisent.
 *
 * Trois d'entre elles y cherchent quelque chose : `cross-schema-join` la liste
 * des schémas du `datasource`, `money-units` les commentaires qui mentent sur
 * une unité, `sku-never-recycled` les `@@unique` de l'identité produit. Toutes
 * les trois faisaient `readFileSync("apps/lfd-api/prisma/schema.prisma")`.
 *
 * Le fichier est devenu un DOSSIER le 2026-09-10 (4846 lignes, 129 blocs, cf.
 * `apps/lfd-api/prisma/schema/datasource.prisma`). Les trois auraient échoué
 * bruyamment — `readFileSync` sur un répertoire lève `EISDIR` —, ce qui était
 * la bonne nouvelle : aucune ne serait passée au vert faute de trouver ce
 * qu'elle garde. Mais trois copies d'une même lecture, c'est trois occasions
 * d'en oublier une au prochain déplacement.
 *
 * 🔴 Ces portes tournent depuis la RACINE du monorepo (`pnpm lint:gates`), donc
 * le chemin est relatif à elle, comme il l'était avant.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Le dossier des sources Prisma, relatif à la racine du monorepo. */
export const PRISMA_SCHEMA_DIR = "apps/lfd-api/prisma/schema";

/**
 * Tous les `.prisma` du dossier, sous-dossiers compris, concaténés.
 *
 * ⚠️ **L'ordre n'a aucun sens sémantique** — Prisma fusionne les fichiers en un
 * seul modèle et se moque de qui vient avant. Il est trié pour être
 * reproductible d'une machine à l'autre (`readdirSync` ne garantit pas le sien),
 * pas parce qu'il signifierait quoi que ce soit.
 *
 * 🔴 Le `\n` de jointure n'est pas cosmétique : sans lui, le `}` final d'un
 * fichier et le `model X {` du suivant partageraient une ligne, et toute porte
 * qui travaille ligne à ligne perdrait le bloc — en silence.
 */
export function prismaSchemaSource(root = process.cwd()) {
  return prismaSchemaFiles(root)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

/** Les chemins des `.prisma`, triés. */
export function prismaSchemaFiles(root = process.cwd()) {
  return walk(join(root, PRISMA_SCHEMA_DIR)).sort((a, b) => a.localeCompare(b));
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walk(path);
    }
    return entry.name.endsWith(".prisma") ? [path] : [];
  });
}
