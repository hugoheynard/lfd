import type { IssuedRefund } from "../../../domain/ports/card-provider-types.js";
import {
  CHARGED,
  NOW,
  refundHarness,
  seedPayment,
  seedRequest,
  type RefundHarness,
} from "../../refunds/__tests__/card-refund-harness.js";
import { IssueCardRefundCommand } from "../issue-card-refund.command.js";

/** Le banc commun des specs de l'exécuteur (plan M2, §3.5). */

export function issued(overrides: Partial<IssuedRefund> = {}): IssuedRefund {
  return {
    refundId: "re_1",
    amountCents: CHARGED,
    currency: "eur",
    status: "pending",
    createdAt: NOW,
    ...overrides,
  };
}

/** Un paiement encaissé et une `remainder` à émettre. */
export function ready(): RefundHarness {
  const h = refundHarness();
  seedPayment(h);
  seedRequest(h);
  return h;
}

export const issue = (h: RefundHarness, requestId = "req_1") =>
  h.issuer.execute(new IssueCardRefundCommand(requestId));

export const kinds = (h: RefundHarness) =>
  h.settlement.refundOutcomes.map((outcome) => outcome.kind);
