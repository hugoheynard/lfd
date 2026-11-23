import type { ExportReaderKey } from "../../../domain/entities/export-reader-key.js";
import { ExportKeySecretSource } from "../../../domain/ports/export-key-secret-source.js";
import { ExportReaderKeyLookup } from "../../../domain/ports/export-reader-key.lookup.js";
import { ExportReaderKeyRepository } from "../../../domain/ports/export-reader-key.repository.js";

/**
 * Les clés en mémoire : dépôt et recherche par haché à la fois, chaque
 * `save` gardé tel que l'adaptateur l'aurait rangé (relu par `rehydrate`
 * côté réel ; ici l'agrégat lui-même).
 */
export class MemoryExportReaderKeys extends ExportReaderKeyRepository {
  readonly saved: ExportReaderKey[] = [];
  private readonly byId = new Map<string, ExportReaderKey>();

  load(id: string): Promise<ExportReaderKey | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  save(key: ExportReaderKey): Promise<void> {
    this.saved.push(key);
    this.byId.set(key.id, key);
    return Promise.resolve();
  }

  /** La recherche de la garde, sur les mêmes clés. */
  lookup(): ExportReaderKeyLookup {
    const keys = this.byId;
    return new (class extends ExportReaderKeyLookup {
      findBySecretHash(secretHash: string): Promise<ExportReaderKey | null> {
        const found = [...keys.values()].find(
          (key) => key.toPersistence().secretHash === secretHash,
        );
        return Promise.resolve(found ?? null);
      }
    })();
  }
}

/** Une source de secrets prévisible : `<préfixe>` complété à 43 signes, numéroté. */
export class FixedExportKeySecrets extends ExportKeySecretSource {
  private counter = 0;

  next(): string {
    this.counter += 1;
    return `secret-${String(this.counter)}-`.padEnd(43, "x");
  }
}
