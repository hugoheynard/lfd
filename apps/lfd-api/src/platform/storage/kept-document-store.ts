import { CustomerDocumentStore } from "./customer-document-store.js";
import type { DocumentStore, StoredDocument } from "./document-store.js";

/**
 * **Un stockage de pièces dont on ne retire rien** — l'adaptateur de
 * {@link CustomerDocumentStore}.
 *
 * ## Pourquoi une enveloppe, et pas l'adaptateur S3 directement
 *
 * `S3DocumentStore` sait supprimer, et il le doit : les preuves de mandat se
 * purgent. Le fournir tel quel sous ce port aurait retiré `delete` du TYPE sans
 * le retirer de l'OBJET — l'appel serait resté à un cast près. Cette enveloppe
 * ne délègue que ce que le port déclare : `delete` n'existe pas sur l'instance.
 *
 * Elle n'ajoute rien d'autre. Les pannes, la distinction entre absence et
 * refus, la journalisation restent celles de l'adaptateur enveloppé.
 */
export class KeptDocumentStore extends CustomerDocumentStore {
  constructor(private readonly inner: DocumentStore) {
    super();
  }

  save(key: string, document: StoredDocument): Promise<string> {
    return this.inner.save(key, document);
  }

  read(key: string): Promise<Buffer> {
    return this.inner.read(key);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return this.inner.readIfPresent(key);
  }
}
