import type { PaymentStatus } from "@lfd/contracts";

import type { RevisionChange } from "../entities/order-revision.js";
import { settlementRegimeOf } from "./settlement-regime.js";

/**
 * **Changer les quantités d'une commande inscrite** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7) — pur. « À partir du moment où c'est parti en prod, c'est de la
 * quantité » (Hugo, 2026-10-25) : après l'arrêt du plan, l'équipe seule
 * change les quantités (≥ 1) des lignes d'une commande au compte. Ni date,
 * ni mode, ni lieu, ni article, ni rien d'autre — et pas les particuliers,
 * dont la carte n'a pas de révision (M2 non bâti).
 */

/** Jusqu'où une révision va, vue du commerce : la règle d'avant, ou les quantités après l'arrêt. */
export type RevisionScope = "full" | "quantities";

/** L'explication dite à l'équipe quand seules les quantités se modifient. */
export const QUANTITIES_ONLY_NOTE =
  "Le plan du fournil est arrêté pour cette commande : seules les quantités des articles déjà commandés se modifient " +
  "(au moins 1 chacun). La date, l'acheminement, la note et les articles ne changent plus ; " +
  "pour retirer un article, laissez-en 1 ou annulez la commande.";

/** § 7 : l'équipe, et une commande au compte (`account`) — rien d'autre. */
export function quantitiesAfterArrestAllowed(
  actorKind: "customer" | "staff",
  paymentStatus: PaymentStatus,
  totalCents: number,
): boolean {
  return actorKind === "staff" && settlementRegimeOf(paymentStatus, totalCents) === "account";
}

/** Ce que la règle lit d'une révision : ses changements et sa composition (un `OrderRevisionToSave`). */
export interface QuantitiesRevision {
  readonly changes: readonly RevisionChange[];
  readonly state: {
    readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
  };
}

/**
 * La révision ne change QUE des quantités : le seul changement est `lines`,
 * mêmes articles, chacun au moins 1. La clé (jour, commande, article) du
 * colisage ne bouge donc jamais (§ 7, B1).
 *
 * @param previous les lignes de la commande avant la révision.
 */
export function isQuantitiesOnly(
  previous: readonly { readonly sku: string }[],
  revision: QuantitiesRevision,
): boolean {
  if (!revision.changes.every((change) => change === "lines")) {
    return false;
  }
  const before = new Set(previous.map((line) => line.sku));
  const after = revision.state.lines;
  return (
    // Les articles DISTINCTS : un doublon de A ne remplace pas B (vérifié le 2026-10-25).
    new Set(after.map((line) => line.sku)).size === before.size &&
    after.every((line) => before.has(line.sku) && line.quantity >= 1)
  );
}

/** La composition révisée, telle que les ateliers la reçoivent : un article, son dû. */
export function revisedQuantitiesOf(
  revision: QuantitiesRevision,
): readonly { readonly sku: string; readonly quantity: number }[] {
  return revision.state.lines.map((line) => ({ sku: line.sku, quantity: line.quantity }));
}
