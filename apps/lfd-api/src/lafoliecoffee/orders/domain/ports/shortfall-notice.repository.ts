import type { ContentLocale } from "@lfd/contracts";

import type { ShortfallNotice } from "../entities/shortfall-notice.js";

/** La décision relue sous son verrou, et à qui, dans quelle langue, écrire. */
export interface LockedShortfallNotice {
  readonly notice: ShortfallNotice;
  /** Le client qui a passé la commande : le destinataire. */
  readonly placedByUserId: string;
  /** La langue de la commande ; `null` = commande sans langue. */
  readonly locale: ContentLocale | null;
}

/**
 * Port d'**écriture** du client prévenu (plan E6d) — il prend l'agrégat.
 * Séparé de `ShortfallDecisionRepository` : décider n'écrit jamais au client,
 * et écrire au client ne décide rien.
 */
export abstract class ShortfallNoticeRepository {
  /**
   * Verrouille la décision de la commande (`SELECT … FOR UPDATE`) et la relit.
   * `null` : aucune décision. Dans une unité de travail.
   */
  abstract lock(orderId: string): Promise<LockedShortfallNotice | null>;

  /** Écrit l'instant et l'auteur de l'envoi — rien d'autre de la décision. */
  abstract save(notice: ShortfallNotice): Promise<void>;
}
