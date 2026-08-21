import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { TechnicalError } from "../shared/errors/app-error.js";

/**
 * **Le contrôle au boot : la base porte-t-elle bien toutes les migrations que
 * ce code attend ?**
 *
 * Sans lui, une base en retard ne se signale qu'à l'usage : la première route
 * qui touche une table absente rend un 500 `persistence.schema_out_of_sync`,
 * et tout le reste continue de fonctionner. On sert donc une base à trous en
 * croyant l'application saine — c'est arrivé en dev le 2026-08-21, cinq
 * migrations de retard, découvertes par une pile d'erreurs à l'écran.
 *
 * Le contrôle déplace ce constat au démarrage, là où il est lisible et où il
 * n'a encore rien cassé. Il est volontairement **naïf** : il compare des noms
 * de dossiers au journal de Prisma. Il ne prouve pas que le SQL appliqué est
 * celui du dépôt (Prisma le vérifie par empreinte, `migrate deploy` échoue si
 * une migration a été réécrite) — il attrape le cas courant, celui qu'on subit.
 *
 * ⚠️ Il ne s'alarme QUE de ce qui manque, jamais de ce qui est en trop : une
 * base plus avancée que le code est l'état normal d'un retour en arrière
 * applicatif, et refuser de démarrer alors interdirait précisément la manœuvre
 * qui répare une mise en production ratée.
 */

/** La base est en retard sur le code : elle n'a pas toutes les migrations. */
export class DatabaseMigrationsPendingError extends TechnicalError {
  constructor(readonly pending: readonly string[]) {
    super(
      "persistence.migrations_pending",
      `La base de données est en retard de ${pending.length} migration(s) : ` +
        `${pending.join(", ")}. Appliquer \`pnpm --filter lfd-api exec prisma migrate deploy\`.`,
    );
  }
}

/** Le dossier des migrations est absent de l'image — défaut d'empaquetage. */
export class MigrationsFolderMissingError extends TechnicalError {
  constructor(readonly path: string) {
    super(
      "persistence.migrations_folder_missing",
      `Le dossier des migrations est introuvable (${path}) : l'image ne contient ` +
        `pas \`prisma/migrations\`, le contrôle de fraîcheur ne peut pas se faire.`,
    );
  }
}

/** Lit le journal des migrations terminées. Rend `[]` si le journal n'existe pas. */
export interface AppliedMigrations {
  read(): Promise<readonly string[]>;
}

/**
 * Les migrations présentes sur le disque, triées comme Prisma les applique —
 * l'horodatage préfixe le nom, donc l'ordre alphabétique EST l'ordre temporel.
 */
export function migrationsOnDisk(appRoot: string): readonly string[] {
  const folder = join(appRoot, "prisma", "migrations");
  if (!existsSync(folder)) {
    throw new MigrationsFolderMissingError(folder);
  }
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Celles que le dépôt connaît et que la base n'a pas terminées. */
export function pendingMigrations(
  onDisk: readonly string[],
  applied: readonly string[],
): readonly string[] {
  const done = new Set(applied);
  return onDisk.filter((name) => !done.has(name));
}

/** Le contrôle lui-même. Lève si la base est en retard, se tait sinon. */
export async function assertSchemaIsFresh(
  journal: AppliedMigrations,
  appRoot: string,
): Promise<void> {
  const pending = pendingMigrations(migrationsOnDisk(appRoot), await journal.read());
  if (pending.length > 0) {
    throw new DatabaseMigrationsPendingError(pending);
  }
}
