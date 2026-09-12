import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * **Le schéma Prisma tel que Prisma le voit** : tous les `.prisma` du dossier
 * `prisma/schema/`, sous-dossiers compris, concaténés dans l'ordre où Node les
 * énumère.
 *
 * Deux lecteurs s'en servent — le harnais e2e, qui y lit les schémas à tronquer,
 * et la parité de la table des schémas. Ils lisaient chacun
 * `prisma/schema.prisma` avec leur propre `readFileSync` ; le fichier est devenu
 * un dossier le 2026-09-10, et deux copies d'une même lecture, c'est deux
 * occasions d'en oublier une.
 *
 * ⚠️ **Il vit dans `src/` alors qu'aucun code servi ne l'appelle** — le harnais
 * e2e et la parité de la table des schémas sont ses deux seuls lecteurs. Il y
 * est parce qu'il n'a pas le choix : `lint:context-boundaries` refuse qu'un
 * spec de `src/` atteigne `test/`, et il a raison de le refuser. `platform/`
 * est son camp — il lit des fichiers du dépôt et ne connaît aucun métier,
 * exactement comme `schema-freshness.ts` à côté de lui.
 *
 * ⚠️ **L'ordre de concaténation n'a aucun sens sémantique** — Prisma fusionne
 * les fichiers en un seul modèle et se moque de qui vient avant. Ne rien en
 * déduire : un appelant qui a besoin d'un ordre (les blocs d'un modèle, ses
 * `@@schema`) doit le tirer du contenu, jamais de la position.
 *
 * 🔴 Sépare les fichiers par un saut de ligne. Sans lui, la dernière ligne d'un
 * fichier et la première du suivant se colleraient — un `}` suivi d'un
 * `model X {` donnerait une ligne qu'aucune des deux expressions régulières
 * appelantes ne reconnaîtrait, et le bloc disparaîtrait en silence.
 */
export function prismaSchemaSource(): string {
  return prismaSchemaFiles()
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

/**
 * Les chemins des `.prisma`, triés — pour qu'une lecture soit reproductible
 * d'une machine à l'autre, `readdirSync` ne garantissant pas son ordre.
 *
 * Le chemin part de CE fichier, pas du répertoire courant : un test lancé depuis
 * la racine du monorepo ou depuis l'app doit lire le même schéma.
 */
export function prismaSchemaFiles(): readonly string[] {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "prisma", "schema");
  return walk(root).sort((a, b) => a.localeCompare(b));
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walk(path);
    }
    return entry.name.endsWith(".prisma") ? [path] : [];
  });
}
