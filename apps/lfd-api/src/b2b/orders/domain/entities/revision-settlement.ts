import type { CardRevisionRefusal } from "../errors/order-revision-errors.js";
import { isCardSettlement } from "../services/order-revisability.js";
import { settlementRegimeOf } from "../services/settlement-regime.js";
import type { OrderRevisionToSave, RevisableOrder } from "./order-revision.js";

/**
 * **Comment la révision se règle** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, R2 bis) — le
 * tri de l'agrégat, APRÈS la composition, sans lever :
 *
 * - `same_settlement` — au compte ou à total nul : comme la commande (M1) ;
 * - `card_complement` — carte encaissée et hausse : un complément à payer ;
 * - `card_not_revisable` — carte, et ni l'un ni l'autre.
 *
 * Les commandes lèvent (`CardOrderNotRevisableError`), le devis affichera.
 */
export type RevisionSettlement =
  | { readonly kind: "same_settlement" }
  | { readonly kind: "card_complement"; readonly complementCents: number }
  | {
      readonly kind: "card_not_revisable";
      readonly reason: Exclude<CardRevisionRefusal, "increase">;
    };

/** Une révision recomposée et son règlement (R2 bis). */
export interface RecomposedRevision {
  readonly revision: OrderRevisionToSave;
  readonly settlement: RevisionSettlement;
}

/**
 * Le tri du règlement, sur le total d'AVANT et celui d'après. Une commande
 * dont la carte n'est pas encaissée (`due`) ne se révise pas ; encaissée
 * (`paid`, `refunded` compris, comme `settlementRegimeOf`), seule une hausse
 * a un chemin.
 */
export function revisionSettlementOf(
  order: RevisableOrder,
  totalAfterCents: number,
): RevisionSettlement {
  if (!isCardSettlement(order.paymentStatus, order.totalCents)) {
    return { kind: "same_settlement" };
  }
  if (settlementRegimeOf(order.paymentStatus, order.totalCents) === "due") {
    return { kind: "card_not_revisable", reason: "unsettled" };
  }
  if (totalAfterCents > order.totalCents) {
    return { kind: "card_complement", complementCents: totalAfterCents - order.totalCents };
  }
  return {
    kind: "card_not_revisable",
    reason: totalAfterCents === order.totalCents ? "same_total" : "decrease",
  };
}

/** Ce que M1 oppose à un règlement qui n'est pas le sien : la raison du refus. */
export function cardRefusalOf(settlement: RevisionSettlement): CardRevisionRefusal | null {
  switch (settlement.kind) {
    case "same_settlement":
      return null;
    case "card_complement":
      return "increase";
    case "card_not_revisable":
      return settlement.reason;
  }
}
