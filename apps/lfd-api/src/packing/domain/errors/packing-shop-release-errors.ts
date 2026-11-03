import type { SaleUnit } from "@lfd/money";

import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";
import { unitWord } from "./unit-word.js";

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
  constructor(sku: string, quantity: number, unit: SaleUnit = "piece") {
    super(
      "packing.stock.move_quantity_invalid",
      `Le mouvement de « ${sku} » doit être un nombre entier de ${unitWord(unit)}, positif ou nul (reçu : ${String(quantity)}).`,
    );
  }
}

/**
 * Un bac rend plus que la réserve ne compte au bac (audit du réassort,
 * 2026-11-02) : le compte des lignes et celui de la réserve ne s'accordent
 * plus. Un `Math.max(0, …)` le taisait en remettant le compte à zéro — et le
 * libre gonflait d'autant ; c'est une incohérence de nos données, elle se
 * dit, et rien n'est écrit. Même figure que `PackedResupplyStockInconsistentError`.
 */
export class PackedStockInconsistentError extends TechnicalError {
  constructor(sku: string, packed: number, released: number, unit: SaleUnit = "piece") {
    super(
      "packing.stock.packed_inconsistent",
      `La réserve du colisage ne compte que ${String(packed)} ${unitWord(unit)} de « ${sku} » au bac, et ce geste en rendrait ${String(released)} : rien n'a été changé. Rechargez le poste ; si l'écart reste, signalez-le à l'équipe technique avec la commande concernée.`,
    );
  }
}

/**
 * La réserve relue compte plus de sorties que d'entrées : `au bac + rendu +
 * envoyé en boutique > reçu` (audit final du réassort, 2026-11-03). Aucun
 * geste de l'agrégat ne l'écrit ; relue telle quelle, elle aurait servi un
 * libre faux (borné à zéro) sans que personne le sache. Rien n'est écrit.
 */
export class PackingStockOverdrawnError extends TechnicalError {
  constructor(
    serviceDay: string,
    sku: string,
    counters: {
      readonly received: number;
      readonly packed: number;
      readonly returned: number;
      readonly sentToShop: number;
    },
  ) {
    const { received, packed, returned, sentToShop } = counters;
    super(
      "packing.stock.overdrawn",
      `La réserve du colisage de « ${sku} » pour le ${serviceDay} compte ${String(packed)} au bac, ${String(returned)} rendus et ${String(sentToShop)} envoyés en boutique pour ${String(received)} reçus : elle est incohérente, et le geste n'a rien écrit. Signalez-le à l'équipe technique avec l'article et la journée.`,
    );
  }
}
