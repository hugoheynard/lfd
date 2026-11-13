import type { ContentLocale } from "@lfd/contracts";

/** Ce que le courriel du reste rendu lit de la commande. */
export interface ShortfallRefundedNotice {
  /** Le numéro de la commande. */
  readonly reference: string;
  /** Le client qui l'a passée : le destinataire. */
  readonly placedByUserId: string;
  /** La langue de la commande ; `null` = commande sans langue. */
  readonly locale: ContentLocale | null;
}

/**
 * Port de **lecture** du courriel « le reste vous a été remboursé » (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 7) — sans
 * verrou : l'argent est déjà rendu, le courriel ne fait que le dire.
 */
export abstract class ShortfallRefundedNoticeReader {
  /** `null` : commande inconnue. */
  abstract noticeOf(orderId: string): Promise<ShortfallRefundedNotice | null>;
}
