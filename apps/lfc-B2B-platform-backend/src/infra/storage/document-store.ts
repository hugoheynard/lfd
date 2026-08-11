/** Une pièce à ranger : ses octets et le type déduit de son **contenu**. */
export interface StoredDocument {
  readonly bytes: Buffer;
  /** Type MIME **dérivé des octets**, jamais celui annoncé par le client. */
  readonly contentType: string;
}

/**
 * Port vers le **stockage objet** des pièces (R2/S3) — KBIS, mandat signé.
 *
 * Aucun fichier ne vit en base : seules sa **clé** et ses métadonnées y sont
 * gardées. Le domaine ne connaît ni bucket ni credentials ; il range une pièce
 * sous une clé qu'il compose, et la relit par cette clé.
 *
 * **La clé ne vient jamais du client.** Chaque appelant la dérive d'identifiants
 * qu'il a vérifiés (`companies/{id}/…`) : c'est le mur de tenancy du stockage,
 * et il est dans le chemin. Un port générique ne l'affaiblit pas — il déplace
 * seulement la composition chez celui qui sait de quelle pièce il s'agit.
 */
export abstract class DocumentStore {
  /**
   * Range la pièce sous cette clé et renvoie la clé (à garder en base). Une
   * même clé écrase : c'est ce qui fait qu'un remplacement reste un remplacement.
   * @throws {DocumentStorageUnavailableError} stockage non configuré ou en échec.
   */
  abstract save(key: string, document: StoredDocument): Promise<string>;

  /**
   * Relit la pièce par sa clé.
   * @throws {DocumentStorageUnavailableError} stockage non configuré ou en échec.
   */
  abstract read(key: string): Promise<Buffer>;
}
