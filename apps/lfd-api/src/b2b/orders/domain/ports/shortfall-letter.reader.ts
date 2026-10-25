import type { ContentLocale } from "@lfd/contracts";

import type { ShortfallQuantity } from "../entities/order-shortfall.js";

/** Ce que la proposition de lettre lit d'une commande décidée. */
export interface ShortfallLetterSubject {
  readonly reference: string;
  /** La langue de la commande ; `null` = commande sans langue. */
  readonly locale: ContentLocale | null;
  /** Le client a déjà été prévenu de cette décision. */
  readonly notified: boolean;
  /** Le signal décidé : dû et au bac, par article. */
  readonly lines: readonly ShortfallQuantity[];
  /** Le nom de chaque article, tel que la commande l'a figé. */
  readonly names: ReadonlyMap<string, string>;
}

/**
 * Port de **lecture** de la proposition « Écrire au client » (plan E6d) —
 * sans verrou : c'est un affichage. Route staff, cross-tenant, gardée en
 * amont par `b2b_orders_shortfall`.
 */
export abstract class ShortfallLetterReader {
  /** `null` : commande inconnue, ou départ non décidé. */
  abstract subjectOf(orderId: string): Promise<ShortfallLetterSubject | null>;
}
