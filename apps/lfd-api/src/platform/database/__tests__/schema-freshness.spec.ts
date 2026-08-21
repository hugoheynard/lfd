import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertSchemaIsFresh,
  DatabaseMigrationsPendingError,
  migrationsOnDisk,
  MigrationsFolderMissingError,
  pendingMigrations,
} from "../schema-freshness.js";

describe("le contrôle de fraîcheur du schéma", () => {
  describe("ce qu'il considère manquant", () => {
    it("ne retient que les migrations du dépôt absentes du journal", () => {
      expect(pendingMigrations(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
    });

    it("se tait quand tout est appliqué", () => {
      expect(pendingMigrations(["a", "b"], ["a", "b"])).toEqual([]);
    });

    /**
     * Le cas qui justifie la règle : après un retour en arrière applicatif, la
     * base porte des migrations que ce code ne connaît pas. Refuser de démarrer
     * là interdirait la manœuvre même qui répare une mise en production ratée.
     */
    it("laisse démarrer une base PLUS AVANCÉE que le code", () => {
      expect(pendingMigrations(["a"], ["a", "b", "c"])).toEqual([]);
    });

    /** Une base jamais migrée : tout manque, et le message doit le dire. */
    it("compte tout comme manquant quand le journal est vide", () => {
      expect(pendingMigrations(["a", "b"], [])).toEqual(["a", "b"]);
    });
  });

  describe("ce qu'il lit sur le disque", () => {
    it("ordonne les migrations et ignore les fichiers", () => {
      const root = fakeApp(["20260102000000_deux", "20260101000000_un"], ["migration_lock.toml"]);
      expect(migrationsOnDisk(root)).toEqual(["20260101000000_un", "20260102000000_deux"]);
    });

    it("refuse de conclure si le dossier des migrations est absent de l'image", () => {
      const root = mkdtempSync(join(tmpdir(), "sans-migrations-"));
      expect(() => migrationsOnDisk(root)).toThrow(MigrationsFolderMissingError);
    });
  });

  describe("le verdict au boot", () => {
    it("nomme les migrations manquantes plutôt que de dire « pas à jour »", async () => {
      const root = fakeApp(["20260101000000_un", "20260102000000_deux"]);
      const verdict = (): Promise<void> =>
        assertSchemaIsFresh({ read: () => Promise.resolve(["20260101000000_un"]) }, root);

      await expect(verdict()).rejects.toThrow(DatabaseMigrationsPendingError);
      await expect(verdict()).rejects.toThrow("20260102000000_deux");
    });

    it("se laisse démarrer quand la base est à jour", async () => {
      const root = fakeApp(["20260101000000_un"]);
      await expect(
        assertSchemaIsFresh({ read: () => Promise.resolve(["20260101000000_un"]) }, root),
      ).resolves.toBeUndefined();
    });
  });
});

/** Une arborescence `prisma/migrations` jetable. */
function fakeApp(migrations: readonly string[], files: readonly string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "app-"));
  const folder = join(root, "prisma", "migrations");
  mkdirSync(folder, { recursive: true });
  for (const name of migrations) {
    mkdirSync(join(folder, name));
  }
  for (const name of files) {
    writeFileSync(join(folder, name), "");
  }
  return root;
}
