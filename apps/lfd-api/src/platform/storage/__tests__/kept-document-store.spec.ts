import type { CustomerDocumentStore } from "../customer-document-store.js";
import { DocumentStore, type StoredDocument } from "../document-store.js";
import { KeptDocumentStore } from "../kept-document-store.js";

/**
 * Un stockage en mémoire qui SAIT supprimer — comme l'adaptateur S3 qu'on
 * enveloppe en production. C'est ce qui rend le test utile : l'enveloppe doit
 * cacher un `delete` qui existe bel et bien dessous.
 */
class MemoryStore extends DocumentStore {
  readonly objects = new Map<string, Buffer>();
  deletions = 0;

  save(key: string, document: StoredDocument): Promise<string> {
    this.objects.set(key, document.bytes);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined ? Promise.reject(new Error("absente")) : Promise.resolve(found);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  delete(key: string): Promise<void> {
    this.deletions += 1;
    this.objects.delete(key);
    return Promise.resolve();
  }
}

const BON = "orders/o_1/bon-de-commande-r0.pdf";
const PDF: StoredDocument = { bytes: Buffer.from("%PDF-1.7"), contentType: "application/pdf" };

describe("KeptDocumentStore — les pièces qu'un client peut nous opposer", () => {
  /**
   * Régression : le port des pièces client héritait du `delete` de
   * `DocumentStore`. Rien ne supprimait un bon de commande, mais rien ne
   * l'empêchait non plus (Hugo, 2026-09-17 : « on ne peut pas supprimer un bon
   * qui a été émis à juste titre »).
   */
  it("🔴 n'offre AUCUN moyen de supprimer, même quand le stockage dessous le sait", () => {
    const store: CustomerDocumentStore = new KeptDocumentStore(new MemoryStore());

    expect("delete" in store).toBe(false);
  });

  it("range et relit par le stockage enveloppé", async () => {
    const inner = new MemoryStore();
    const store = new KeptDocumentStore(inner);

    await expect(store.save(BON, PDF)).resolves.toBe(BON);
    await expect(store.read(BON)).resolves.toEqual(PDF.bytes);
    await expect(store.readIfPresent(BON)).resolves.toEqual(PDF.bytes);
    expect(inner.deletions).toBe(0);
  });

  it("rend l'absence telle que le stockage enveloppé la dit", async () => {
    const store = new KeptDocumentStore(new MemoryStore());

    await expect(store.readIfPresent(BON)).resolves.toBeNull();
    await expect(store.read(BON)).rejects.toThrow("absente");
  });
});
