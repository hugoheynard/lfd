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
   *
   * L'absence est une **panne** ici, et c'est voulu : cette méthode sert les
   * appelants pour qui la base a déjà promis le fichier (un KBIS dont la ligne
   * porte la `storageKey`). Une clé manquante y signale une incohérence entre la
   * base et le bucket, et doit se voir.
   *
   * @throws {DocumentStorageUnavailableError} stockage non configuré, en échec,
   *   **ou pièce absente**.
   */
  abstract read(key: string): Promise<Buffer>;

  /**
   * Relit la pièce, ou rend `null` si elle **n'a jamais été rangée**.
   *
   * 🔴 Ce n'est pas un `read` plus permissif : c'est la distinction entre une
   * absence et une panne, et elle manquait. Le bon de commande est archivé au
   * premier téléchargement, donc « la clé n'existe pas » est son cas COURANT —
   * pas une anomalie. Son handler enveloppait donc `read` dans un `try/catch`
   * qui rendait `null`, avec deux conséquences :
   *
   * 1. chaque premier téléchargement journalisait une ERREUR pour un chemin
   *    parfaitement sain, et des erreurs qui sonnent sur le chemin heureux
   *    finissent par n'être plus lues ;
   * 2. surtout, ce `catch` **avalait aussi les vraies pannes**. Un bucket mal
   *    nommé, une clé refusée, une signature invalide : tout devenait « pas
   *    encore archivé », et l'API refabriquait en silence pour toujours. Le
   *    symptôme d'un stockage cassé était l'absence de symptôme.
   *
   * Ici l'absence est une RÉPONSE — `null`, sans journal — et une panne reste une
   * panne, qui lève et se voit.
   *
   * @throws {DocumentStorageUnavailableError} stockage non configuré ou en échec.
   */
  abstract readIfPresent(key: string): Promise<Buffer | null>;
}
