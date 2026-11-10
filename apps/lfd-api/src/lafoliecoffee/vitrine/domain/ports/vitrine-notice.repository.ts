import type { VitrineNotice } from "../vitrine-notice.js";

/** Ce que l'ouverture d'une annonce a trouvé : la sienne, ou celle qui tenait déjà la clé. */
export type VitrineNoticeOpening =
  { readonly opened: true } | { readonly opened: false; readonly existingId: string };

/** Port d'écriture des annonces : l'agrégat entier. */
export abstract class VitrineNoticeRepository {
  /** L'id de l'annonce qui tient cette clé d'idempotence, ou `null`. */
  abstract idOfKey(idempotencyKey: string): Promise<string | null>;
  /**
   * Range une annonce neuve. Si une autre a pris la même clé entre-temps (deux
   * clics à la milliseconde), rien n'est écrit et son id est rendu : c'est la
   * contrainte d'unicité qui tranche, pas une lecture préalable.
   */
  abstract open(notice: VitrineNotice): Promise<VitrineNoticeOpening>;
  /** L'annonce et ses destinataires, ou `null` si l'id ne désigne rien. */
  abstract load(id: string): Promise<VitrineNotice | null>;
  /**
   * Consigne l'issue des envois (destinataires seulement : le texte ne bouge
   * pas). Une issue DÉJÀ consignée en base n'est jamais réécrite — deux
   * reprises simultanées ne se contredisent pas au journal.
   */
  abstract save(notice: VitrineNotice): Promise<void>;
}
