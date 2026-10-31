import { Logger } from "@nestjs/common";

import type { FrozenInvoiceOrder } from "../domain/services/invoice-dossier.types.js";
import { basketDiscountFallbackOf } from "../domain/services/invoice-order-split.js";

/**
 * **Un repli de la facture ne passe jamais en silence** (plan des promotions,
 * § 18.4, lot M5, consigne du 2026-10-31). Une commande à plusieurs remises
 * dont les parts figées ne tombent pas juste est facturée au bon montant,
 * mais sous la remise client, sans le détail par promotion : c'est un écart,
 * et il se journalise ici — le domaine, pur, ne fait que le nommer.
 */

/** Où va l'avertissement ; le journal Nest en production. */
export type FallbackWarn = (message: string) => void;

const LOGGER = new Logger("InvoiceBasketDiscounts");

/** Rend la commande telle quelle, après avoir averti si elle retombe sur la remise client. */
export function warnedOfBasketDiscountFallback(
  order: FrozenInvoiceOrder,
  warn: FallbackWarn = (message) => LOGGER.warn(message),
): FrozenInvoiceOrder {
  const gap = basketDiscountFallbackOf(order);
  if (gap !== null) {
    warn(
      `La commande ${order.reference} porte plusieurs remises de panier, mais ${gap} : ` +
        "sa facture les regroupe sous « Remise client », sans le détail par promotion. " +
        "Le montant facturé reste juste ; signalez l'écart à l'équipe technique.",
    );
  }
  return order;
}
