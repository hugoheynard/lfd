import { z } from "zod";

/**
 * **Le visa des commandes** — un commercial relit une commande qu'un client
 * pro a passée seul et la vise (`documentation/commandes/back-office/plan-visa-des-commandes.md`).
 * Une trace : rien ne la lit pour bloquer quoi que ce soit.
 */

/** La longueur au-delà de laquelle une note de visa n'est plus une note. */
export const ORDER_REVIEW_NOTE_MAX_LENGTH = 1000;

/**
 * Corps de `POST /admin/orders/:id/review`. La note est facultative ; une
 * note faite d'espaces vaut « pas de note » (le domaine la ramène à `null`).
 */
export const reviewOrderPayloadSchema = z.object({
  note: z.string().max(ORDER_REVIEW_NOTE_MAX_LENGTH).nullable().optional(),
});
export type ReviewOrderPayload = z.infer<typeof reviewOrderPayloadSchema>;

/** Le visa en cours, tel qu'une ligne de la liste le porte. */
export interface AdminOrderReviewStamp {
  /** « Prénom Nom », lu dans l'annuaire ; `null` si la fiche n'y est plus. */
  readonly byName: string | null;
  /** ISO 8601. */
  readonly at: string;
}

/** Un visa, en cours ou retiré, tel que le détail le raconte. */
export interface AdminOrderReviewEntry {
  readonly id: string;
  /** La révision de la commande que le visa a vue. */
  readonly reviewedRevision: number;
  /** ISO 8601. */
  readonly reviewedAt: string;
  readonly reviewedByName: string | null;
  readonly note: string | null;
  /** `null` : le visa est en cours. */
  readonly withdrawn: { readonly at: string; readonly byName: string | null } | null;
}

/** Le visa d'une commande, dans son détail. */
export interface AdminOrderReviewState {
  /** Le visa en cours ; `null` : aucun. */
  readonly current: AdminOrderReviewEntry | null;
  /** La commande a été révisée après son visa en cours : elle revient « à vérifier ». */
  readonly revisedSinceReview: boolean;
  /**
   * La commande peut être visée maintenant : dans le périmètre (passée par
   * un client pro seul, ni annulée, après la mise en service) et sans visa
   * en cours.
   */
  readonly reviewable: boolean;
  /** Tous les visas, le plus récent en tête. */
  readonly history: readonly AdminOrderReviewEntry[];
}
