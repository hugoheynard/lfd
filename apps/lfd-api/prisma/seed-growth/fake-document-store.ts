import { DocumentStore, type StoredDocument } from "../../src/platform/storage/document-store.js";

/**
 * `DocumentStore` **factice** pour les seeds : les vrais handlers tournent
 * (validation du PDF, métadonnées, événement `company.step_reached`), seul le
 * stockage objet est simulé — R2 n'est pas configuré en développement, et un
 * seed n'a pas à écrire dans un bucket de production.
 *
 * Rend la clé qu'on lui donne, comme le vrai : c'est elle qui est gardée en base.
 */
export class FakeDocumentStore extends DocumentStore {
  save(key: string, _document: StoredDocument): Promise<string> {
    return Promise.resolve(key);
  }

  read(): Promise<Buffer> {
    return Promise.resolve(Buffer.from("%PDF-1.4\n%seed\n", "latin1"));
  }
}
