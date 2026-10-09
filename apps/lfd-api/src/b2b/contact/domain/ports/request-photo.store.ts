/** Une photo à ranger : ses octets et son type relu. */
export interface RequestPhotoObject {
  readonly bytes: Buffer;
  readonly contentType: string;
}

/**
 * Port du **stockage des photos** de demandes. Trois verbes, dont `delete` :
 * l'anonymisation SUPPRIME les objets (`demandes-clients.md`, §7) — ce
 * que le port du bucket `customers` rend inexprimable par décision
 * (`customer-document-store.ts`, relu le 2026-10-09). Le bucket est choisi à
 * la racine du module, jamais ici.
 */
export abstract class RequestPhotoStore {
  abstract save(key: string, photo: RequestPhotoObject): Promise<void>;
  /** @throws si l'objet manque : la base l'a promis. */
  abstract read(key: string): Promise<Buffer>;
  /** Idempotent : une clé absente est un succès. */
  abstract delete(key: string): Promise<void>;
}
