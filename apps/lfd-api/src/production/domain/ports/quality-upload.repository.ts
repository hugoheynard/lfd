import type { QualityUpload } from "../entities/quality-upload.js";

/**
 * **Les dépôts de photos en attente** (plan `plan-controle-qualite.md`, D8).
 *
 * Un dépôt n'a qu'une règle — {@link QualityUpload.assertAttachableBy} — et elle
 * vit dans l'entité. Ce port range, relit, et marque la libération de l'objet
 * provisoire : une écriture NUE, et c'est voulu — elle constate qu'un objet a
 * été retiré du stockage, après coup, et aucune règle ne peut la refuser.
 */
export abstract class QualityUploadRepository {
  abstract record(upload: QualityUpload): Promise<void>;

  /** Les dépôts trouvés parmi ces identifiants ; les inconnus sont absents du résultat. */
  abstract loadMany(ids: readonly string[]): Promise<readonly QualityUpload[]>;

  /**
   * Les dépôts dont l'objet provisoire est encore au stockage, déposés avant
   * `uploadedBefore` — rattachés ou non : un rattaché dont la libération a
   * échoué après son verdict est rattrapé ici. Les plus vieux d'abord.
   */
  abstract releasable(uploadedBefore: Date, limit: number): Promise<readonly QualityUpload[]>;

  /** L'objet provisoire de ces dépôts a été retiré du stockage. */
  abstract markReleased(ids: readonly string[], at: Date): Promise<void>;
}
