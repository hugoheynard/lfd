import type { ShortfallRemainder } from "@lfd/contracts";

import type { ShortfallQuantity } from "../entities/order-shortfall.js";

/** Le manque signalé sur une commande, et sa décision quand elle est prise (E6b). */
export interface OrderShortfallReading {
  readonly reportedAt: Date;
  readonly lines: readonly ShortfallQuantity[];
  readonly decision: {
    readonly decidedAt: Date;
    readonly remainder: ShortfallRemainder;
    /** « Écrire au client » (E6d) : quand, et l'id de la fiche staff ; `null` = pas prévenu. */
    readonly customerNotice: { readonly at: Date; readonly byStaffId: string } | null;
  } | null;
}

/**
 * Port de **lecture** du manque signalé (lot E6a) — séparé du port d'écriture
 * (`OrderShortfallRepository`) : la fiche commande n'appelle que ceci.
 * Route staff, cross-tenant, gardée en amont par `b2b_orders`.
 */
export abstract class OrderShortfallReader {
  /** `null` : commande inconnue, ou aucun manque signalé (en vigueur ou décidé). */
  abstract of(orderId: string): Promise<OrderShortfallReading | null>;
}
