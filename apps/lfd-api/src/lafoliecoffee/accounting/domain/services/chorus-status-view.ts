import type { ChorusDepositState, ChorusDepositStatusView } from "@lfd/contracts";

import {
  effectiveDueOn,
  publicDeadlineDaysOf,
  type ChorusDepositStanding,
  type DueInvoiceFacts,
} from "./public-invoice-due.js";

/**
 * L'état Chorus d'une pièce, tel que toutes les vues le servent (plan
 * `plan-clients-publics-chorus.md`, T3′) ; `null` hors facture d'organisme
 * public. L'échéance effective vient de la seule `effectiveDueOn`.
 */
export function chorusStatusViewOf(
  facts: DueInvoiceFacts,
  standing: ChorusDepositStanding | null,
): ChorusDepositStatusView | null {
  const paymentDeadlineDays = publicDeadlineDaysOf(facts);
  if (paymentDeadlineDays === null) {
    return null;
  }
  return {
    state: stateOf(standing),
    paymentDeadlineDays,
    depositedOn: standing?.depositedOn ?? null,
    rejectedOn: standing?.rejectedOn ?? null,
    rejectionReason: standing?.rejectionReason ?? null,
    acceptedOn: standing?.acceptedOn ?? null,
    effectiveDueOn: effectiveDueOn(facts, standing),
  };
}

function stateOf(standing: ChorusDepositStanding | null): ChorusDepositState {
  if (standing === null || standing.depositedOn === null) {
    return "to_deposit";
  }
  if (standing.rejectedOn !== null) {
    return "rejected";
  }
  return standing.acceptedOn === null ? "deposited" : "accepted";
}
