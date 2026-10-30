/**
 * La garde du harnais contre une base de worker migrée sur un brouillon.
 *
 * Régression : le 2026-10-30, `promotions-equality` tombait sur le refus de
 * `promotions_archive_whole` quand sa base portait la version d'avant commit
 * de `reprise_des_promotions()` — et passait quand une autre suite l'avait
 * redéfinie avant elle. Rien ne disait que la base était périmée.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertMigrationsUnchanged,
  driftedMigrations,
  migrationChecksum,
} from "./migration-drift.js";
import { testDatabaseUrl } from "./setup-env.js";

const REPRISE = "20261031120000_la_reprise_des_promotions";

function repriseSql(): string {
  return readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "prisma",
      "migrations",
      REPRISE,
      "migration.sql",
    ),
    "utf8",
  );
}

describe("la dérive des migrations appliquées", () => {
  it("nomme une migration dont le fichier a changé après application", () => {
    const applied = [{ name: REPRISE, checksum: migrationChecksum("-- le brouillon\n") }];
    expect(driftedMigrations(applied, () => repriseSql())).toEqual([REPRISE]);
  });

  it("ne dit rien quand le fichier est celui qui a été appliqué", () => {
    const applied = [{ name: REPRISE, checksum: migrationChecksum(repriseSql()) }];
    expect(driftedMigrations(applied, () => repriseSql())).toEqual([]);
  });

  it("ignore une migration appliquée que ce dépôt ne porte pas", () => {
    const applied = [{ name: "20991231000000_d_une_autre_branche", checksum: "x" }];
    expect(driftedMigrations(applied, () => null)).toEqual([]);
  });

  it("la base du worker porte exactement les migrations du dépôt", async () => {
    await expect(assertMigrationsUnchanged(testDatabaseUrl())).resolves.toBeUndefined();
  });
});
