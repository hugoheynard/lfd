import { CardIncreaseNotApplicableError } from "../errors/card-increase-proposal-errors.js";
import {
  CardOrderNotRevisableError,
  type CardRevisionRefusal,
} from "../errors/order-revision-errors.js";
import { isCardSettlement } from "../services/order-revisability.js";
import { settlementRegimeOf } from "../services/settlement-regime.js";
import {
  ensureChanged,
  type OrderRevisionToSave,
  type RevisableOrder,
  type RevisionActor,
} from "./order-revision.js";

/**
 * **Comment la révision se règle** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.2) — le
 * tri de l'agrégat, APRÈS la composition, sans lever :
 *
 * - `same_settlement` — au compte ou à total nul : comme la commande (M1) ;
 *   carte encaissée à total égal aussi : aucun argent ne bouge (plan S1, Q2) ;
 * - `card_complement` — carte encaissée et hausse : un complément à payer ;
 * - `card_refund` — carte encaissée et baisse : la différence rendue sur la
 *   carte (plan `documentation/commandes/modification/modifier-une-commande.md`, §2.7.12) ;
 * - `card_not_revisable` — carte, et aucun de ces chemins.
 *
 * Les commandes lèvent (`CardOrderNotRevisableError`), le devis affichera.
 */
export type RevisionSettlement =
  | { readonly kind: "same_settlement" }
  | { readonly kind: "card_complement"; readonly complementCents: number }
  | { readonly kind: "card_refund"; readonly refundCents: number }
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
 * dont la carte n'est pas encaissée (`due`) ne se révise pas, ni une carte
 * déjà rendue en entier (`refunded`, lu AVANT `settlementRegimeOf`, qui la
 * classe en `paid` — plan S1, R5 bis) ; encaissée, la hausse se paie par un
 * complément, la baisse se rend, le total égal ne bouge pas.
 */
export function revisionSettlementOf(
  order: RevisableOrder,
  totalAfterCents: number,
): RevisionSettlement {
  if (!isCardSettlement(order.paymentStatus, order.totalCents)) {
    return { kind: "same_settlement" };
  }
  if (order.paymentStatus === "refunded") {
    return { kind: "card_not_revisable", reason: "refunded" };
  }
  if (settlementRegimeOf(order.paymentStatus, order.totalCents) === "due") {
    return { kind: "card_not_revisable", reason: "unsettled" };
  }
  if (totalAfterCents > order.totalCents) {
    return { kind: "card_complement", complementCents: totalAfterCents - order.totalCents };
  }
  if (totalAfterCents < order.totalCents) {
    return { kind: "card_refund", refundCents: order.totalCents - totalAfterCents };
  }
  return SAME_SETTLEMENT;
}

const SAME_SETTLEMENT: RevisionSettlement = { kind: "same_settlement" };

/**
 * Le règlement vu par son AUTEUR (plan S2, R15) : l'équipe ne fait pas de
 * hausse carte (Q3 a, Hugo, 2026-11-10) — une hausse qu'elle compose n'a
 * aucun chemin, et se dit `increase_by_staff`, avec son geste de sortie.
 */
export function settlementBy(
  settlement: RevisionSettlement,
  by: RevisionActor["kind"],
): RevisionSettlement {
  return settlement.kind === "card_complement" && by === "staff"
    ? { kind: "card_not_revisable", reason: "increase_by_staff" }
    : settlement;
}

/** Ce que M1 oppose à un règlement qui n'est pas le sien : la raison du refus. */
export function cardRefusalOf(settlement: RevisionSettlement): CardRevisionRefusal | null {
  switch (settlement.kind) {
    case "same_settlement":
    case "card_refund":
      return null;
    case "card_complement":
      return "increase";
    case "card_not_revisable":
      return settlement.reason;
  }
}

/** Les chemins d'une révision : M1 (comme la commande, ou rendue), ou la hausse payée (S2). */
export type ExpectedSettlement = "same_settlement" | "card_complement" | "card_refund";

/**
 * **Le refus de règlement, à l'agrégat** (plan S2, R2 bis, R15 ; plan S1,
 * R5 bis) — la révision passe si son règlement (vu par son auteur) est dans
 * l'ensemble que le geste admet, puis si elle change quelque chose (R6). Le
 * règlement parle avant le « rien n'a changé ».
 *
 * Hors de l'ensemble : la raison du tri (`card_not_revisable`) ; une hausse
 * pour M1 (`increase`) ; pour la hausse payée, qui n'admet que
 * `card_complement`, tout chemin sans complément.
 *
 * @throws {CardOrderNotRevisableError} carte, et pas le chemin de ce geste (avec la raison).
 * @throws {CardIncreaseNotApplicableError} une hausse « carte » sans complément à payer.
 * @throws {UnchangedOrderRevisionError} la révision ne change rien.
 */
export function ensureSettlementExpected(
  current: RevisableOrder,
  recomposed: RecomposedRevision,
  expected: ReadonlySet<ExpectedSettlement>,
  by: RevisionActor["kind"],
): RecomposedRevision {
  const settlement = settlementBy(recomposed.settlement, by);
  if (settlement.kind === "card_not_revisable" || !expected.has(settlement.kind)) {
    throw settlementRefusalOf(current, settlement, expected);
  }
  ensureChanged(recomposed.revision);
  return { revision: recomposed.revision, settlement };
}

function settlementRefusalOf(
  current: RevisableOrder,
  settlement: RevisionSettlement,
  expected: ReadonlySet<ExpectedSettlement>,
): CardIncreaseNotApplicableError | CardOrderNotRevisableError {
  if (settlement.kind !== "card_not_revisable" && expected.has("card_complement")) {
    return new CardIncreaseNotApplicableError(
      current.orderId,
      isCardSettlement(current.paymentStatus, current.totalCents) ? "no_increase" : "not_card",
    );
  }
  return new CardOrderNotRevisableError(current.orderId, cardRefusalOf(settlement));
}
