/** Une image validée, prête à être rangée : ses octets et son type **constaté**. */
export interface PublicAsset {
  readonly bytes: Buffer;
  /** Type MIME dérivé des octets, jamais celui annoncé par le client. */
  readonly contentType: string;
}

/** Où l'objet a été rangé, et à quelle adresse le monde le lira. */
export interface StoredAsset {
  readonly storageKey: string;
  readonly url: string;
}

/**
 * Port vers le stockage des **médias publics** — les visuels du catalogue.
 *
 * ## Pourquoi ce n'est pas `DocumentStore`
 *
 * Les deux rangent des octets dans R2, et c'est tout ce qu'ils partagent. Un
 * KBIS est une pièce d'identité d'entreprise : privé, servi par une URL signée
 * expirante, `Content-Disposition: attachment` **forcé**, jamais mis en cache,
 * et relu à travers l'API. Une photo de viennoiserie est publique par
 * construction : URL stable, servie en ligne, en cache pour toujours, et lue
 * **sans jamais nous traverser** — le domaine média pointe droit sur le bucket.
 *
 * Le seul point commun est le transport (`S3StorageService`), qui est déjà
 * partagé plus bas. Fusionner les deux ports ferait porter au même secret deux
 * niveaux de sensibilité sans rapport ; ils ont des buckets et des jetons
 * distincts, précisément pour qu'un jeton média fuité n'ouvre pas les papiers
 * des clients.
 *
 * ## La clé n'est pas choisie, elle est calculée
 *
 * L'appelant ne compose pas de chemin : il donne un **préfixe d'usage** et des
 * octets, et la clé tombe du hachage du contenu. Il n'y a donc rien à mettre
 * dans un mur de tenancy ici — le même contenu donne la même clé pour tout le
 * monde, ce qui est exactement ce qu'on veut d'un catalogue public, et
 * exactement ce qu'il ne faudrait pas d'une pièce privée.
 */
export abstract class MediaStore {
  /**
   * Range l'image et rend sa clé et son adresse publique. **Idempotent** : le
   * même contenu écrase le même objet, ce qui n'est pas un remplacement mais un
   * non-événement.
   *
   * @throws {MediaStorageUnavailableError} stockage non configuré, sans domaine
   *   public, ou en échec.
   */
  abstract put(prefix: string, asset: PublicAsset): Promise<StoredAsset>;

  /**
   * Supprime un objet. **Idempotent** : supprimer ce qui n'existe pas n'est pas
   * une erreur, et c'est ce qui rend un ramassage rejouable sans précaution.
   *
   * Rien d'autre que le ramassage d'orphelins ne doit appeler ceci. Un visuel
   * retiré d'une fiche n'est PAS supprimable sur-le-champ : le même objet peut
   * servir une fiche voisine, puisque des octets identiques tombent sur la même
   * clé. Seul un comptage global sait qu'un objet n'a plus aucun lecteur.
   *
   * @throws {MediaStorageUnavailableError} stockage non configuré ou en échec.
   */
  abstract remove(storageKey: string): Promise<void>;
}
