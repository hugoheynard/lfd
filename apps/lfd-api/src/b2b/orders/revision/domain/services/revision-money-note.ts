import type { SettlementRegime } from "@lfd/contracts";

/**
 * **Ce que l'argent devient après une révision**, tel que l'e-mail « commande
 * modifiée » le dit (doc `modifier-une-commande.md`, § 2.8) :
 *
 * - `none` : le total n'a pas bougé — rien à dire sur l'argent ;
 * - `invoice` : au compte ou à total nul, la facture portera le nouveau total ;
 * - `card_charged` : carte, total en hausse — la hausse n'est appliquée
 *   qu'une fois son complément payé (§ 2.7.5), la différence est donc réglée ;
 * - `card_refunded` : carte, total en baisse — la différence sera rendue.
 */
export type RevisionMoneyNote = "invoice" | "card_charged" | "card_refunded" | "none";

/** Les régimes d'une commande payable par carte (réglée, ou à régler). */
const CARD_REGIMES: readonly SettlementRegime[] = ["paid", "due"];

export function revisionMoneyNoteOf(
  settlement: SettlementRegime,
  totalBeforeCents: number,
  totalAfterCents: number,
): RevisionMoneyNote {
  if (totalAfterCents === totalBeforeCents) {
    return "none";
  }
  if (!CARD_REGIMES.includes(settlement)) {
    return "invoice";
  }
  return totalAfterCents > totalBeforeCents ? "card_charged" : "card_refunded";
}
