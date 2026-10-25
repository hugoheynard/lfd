import type { CartAdjustment, DeliveryVatMode, LateFeeAdjustment } from "@lfd/contracts";

import type { DepartingQuantity } from "../entities/shortfall-decision.js";

/**
 * Les règles d'argent figées sur la commande — celles qu'un bon de livraison
 * partiel réapplique à ce qui part (plan E6, § 9.2 et § 11) : la remise, les
 * frais, la surtaxe et son taux, le mode de TVA du port.
 */
export interface FrozenOrderAdjustments {
  readonly discount: CartAdjustment | null;
  readonly deliveryFee: CartAdjustment | null;
  readonly lateFee: LateFeeAdjustment | null;
  readonly deliveryVatMode: DeliveryVatMode | null;
}

/** Une décision prise : ce qui part, et les règles avec lesquelles on le recompte. */
export interface DecidedDeparture {
  readonly departing: readonly DepartingQuantity[];
  readonly adjustments: FrozenOrderAdjustments;
}

/**
 * **La décision comme entrée du bon de livraison** (plan
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 13, bloquant 1) —
 * port de lecture déclaré par les commandes, lu par les trois écrivains du BL
 * (le suivi, le réconciliateur, la prévision) : avec une décision, ils
 * réécrivent le BL sur ces quantités, jamais sur la commande entière.
 */
export abstract class ShortfallDecisionReader {
  /** Les décisions de ces commandes, par identifiant ; une commande sans décision n'y est pas. */
  abstract decidedFor(orderIds: readonly string[]): Promise<ReadonlyMap<string, DecidedDeparture>>;
}
