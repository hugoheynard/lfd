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
  /**
   * Les TTC figés d'une commande `exact_ht` (plan
   * `documentation/pricing/plan-centime-particuliers.md`, § 5, « Le bon de
   * livraison partiel ») : le bon imputé et le port, que le BL reprend ;
   * `null` pour une commande `line_ht`. La remise retrait n'y est pas : elle
   * se refait sur le livré.
   */
  readonly exact: FrozenExactTerms | null;
}

/** Ce que le BL partiel d'une commande `exact_ht` reprend de sa commande, en TTC. */
export interface FrozenExactTerms {
  readonly voucherTtcCents: number;
  readonly deliveryFeeTtcCents: number;
}

/** Une décision prise : ce qui part, et les règles avec lesquelles on le recompte. */
export interface DecidedDeparture {
  readonly departing: readonly DepartingQuantity[];
  readonly adjustments: FrozenOrderAdjustments;
}

/**
 * **La décision comme entrée du bon de livraison** (plan
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 13, bloquant 1) —
 * port de lecture déclaré par les commandes, lu par les trois écrivains du
 * BL-1 (le suivi, le réconciliateur, la prévision) : avec une décision, ils
 * réécrivent le BL sur ces quantités, jamais sur la commande entière.
 *
 * Depuis le plan E7 reliquat (LB), la décision est par envoi : ce port ne
 * rend que celle du RANG 1, la seule qui touche le BL qui suit sa commande.
 * Celle d'un reliquat se lit par {@link RemainderDecisionReader}.
 */
export abstract class ShortfallDecisionReader {
  /**
   * Les décisions du rang 1 de ces commandes, par identifiant ; une commande
   * sans décision au rang 1 n'y est pas.
   */
  abstract decidedFor(orderIds: readonly string[]): Promise<ReadonlyMap<string, DecidedDeparture>>;
}

/**
 * **La décision d'un reliquat** (plan E7 reliquat, lot LB) — lue par le seul
 * suivi de la décision d'un envoi de rang > 1, qui réécrit le BL de ce rang
 * sur ses propres lignes. Séparé de {@link ShortfallDecisionReader} : les
 * écrivains du BL-1 n'en ont pas l'usage.
 */
export abstract class RemainderDecisionReader {
  /** La décision de l'envoi `(commande, rang)`, ou `null` s'il n'en a pas. */
  abstract decisionOf(orderId: string, rank: number): Promise<DecidedDeparture | null>;
}
