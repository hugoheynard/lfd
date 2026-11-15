import type { StoredDocument } from "../../../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../../../platform/storage/production-document-store.js";

/** Le bucket de la production, en mémoire ; `failOn` : une opération en panne. */
export class InMemoryProductionStore extends ProductionDocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  failOn: "save" | "read" | "delete" | null = null;

  save(key: string, document: StoredDocument): Promise<string> {
    if (this.failOn === "save") {
      return Promise.reject(new Error("stockage en panne"));
    }
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    if (this.failOn === "read" || found === undefined) {
      return Promise.reject(new Error(`pièce absente : ${key}`));
    }
    return Promise.resolve(found.bytes);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }

  delete(key: string): Promise<void> {
    if (this.failOn === "delete") {
      return Promise.reject(new Error("stockage en panne"));
    }
    this.objects.delete(key);
    return Promise.resolve();
  }
}
