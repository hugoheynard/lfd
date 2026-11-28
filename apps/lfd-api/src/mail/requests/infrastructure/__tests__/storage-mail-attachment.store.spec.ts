import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import type { StoredDocument } from "../../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import { StorageMailAttachmentStore } from "../storage-mail-attachment.store.js";

/** Le stockage des pièces d'un client, en mémoire. */
class CustomerBucket extends CustomerDocumentStore {
  constructor(private readonly objects: ReadonlyMap<string, Buffer>) {
    super();
  }

  save(key: string): Promise<string> {
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    return Promise.resolve(this.objects.get(key) ?? Buffer.alloc(0));
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }
}

/** Le stockage du fournil, en mémoire. */
class ProductionBucket extends ProductionDocumentStore {
  readonly objects = new Map<string, Buffer>();

  save(key: string, document: StoredDocument): Promise<string> {
    this.objects.set(key, document.bytes);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    return Promise.resolve(this.objects.get(key) ?? Buffer.alloc(0));
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

/** Les deux stockages que le bloc `mail` sait relire : un client, le fournil (lot H6). */
describe("StorageMailAttachmentStore", () => {
  const production = new ProductionBucket();
  const store = new StorageMailAttachmentStore(
    new CustomerBucket(new Map([["k", Buffer.from("client")]])),
    production,
  );

  it("relit le dossier du fournil dans le stockage du fournil, pas dans celui des clients", async () => {
    await production.save("k", { bytes: Buffer.from("fournil"), contentType: "application/pdf" });

    expect(
      (await store.readIfPresent({ store: "production-documents", key: "k" }))?.toString(),
    ).toBe("fournil");
    expect((await store.readIfPresent({ store: "customer-documents", key: "k" }))?.toString()).toBe(
      "client",
    );
  });

  it("une pièce absente du fournil rend `null`", async () => {
    expect(await store.readIfPresent({ store: "production-documents", key: "absente" })).toBeNull();
  });
});
