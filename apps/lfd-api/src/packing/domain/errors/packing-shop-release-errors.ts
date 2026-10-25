import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Les refus de l'envoi en boutique depuis la réserve** (plan A1, lot A1.4,
 * `documentation/commandes/annulation/plan-a1-4-envoyer-en-boutique.md`).
 */

/**
 * Le libre de la réserve ne couvre pas l'envoi : des pièces sont au bac,
 * réservées à un réassort lancé, ou déjà parties. Rien n'est envoyé.
 */
export class ReserveShortForShopError extends BusinessError {
  constructor(productName: string, serviceDay: string, free: number, requested: number) {
    super(
      "packing.reserve.short_for_shop",
      `Il ne reste que ${String(free)} « ${productName} » libres à la réserve du ${serviceDay} : impossible d'en envoyer ${String(requested)} en boutique. Rien n'a été envoyé — réduisez la quantité à ce qui est libre.`,
    );
  }
}

/** Une quantité envoyée est un entier strictement positif. */
export class ReserveShopQuantityInvalidError extends DomainError {
  constructor(productName: string, quantity: number) {
    super(
      "packing.reserve.shop_quantity_invalid",
      `La quantité de « ${productName} » à envoyer en boutique doit être un nombre entier de pièces, au moins une (reçu : ${String(quantity)}).`,
    );
  }
}

/**
 * Un mouvement de bac porte un nombre de pièces négatif ou fractionnaire.
 *
 * Aucun appelant n'en produit (vérifié le 2026-10-25 : `allocate-to-container`
 * et `apply-packing-proposal` passent des quantités validées par
 * `OrderContents`) ; mais sans ce refus, `take(-3)` faisait BAISSER le bac
 * sans rien refuser. Zéro reste admis : c'est un mouvement vide.
 */
export class StockMoveQuantityInvalidError extends DomainError {
  constructor(sku: string, quantity: number) {
    super(
      "packing.stock.move_quantity_invalid",
      `Le mouvement de « ${sku} » doit être un nombre entier de pièces, positif ou nul (reçu : ${String(quantity)}).`,
    );
  }
}
