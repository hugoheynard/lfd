import { PaymentSubject } from "../../value-objects/payment-subject.js";
import { CardRefundLedger, type CardRefundLine } from "../../entities/card-refund-ledger.js";
import { AT, inState } from "../../entities/__tests__/card-refund-request-fixtures.js";
import { refundableCentsOf } from "../refund-siblings.js";

/**
 * **Ce qu'un paiement peut encore rendre** (plan S2, R11) — la règle de
 * `requestAmount`, lue aussi par `CardSettlementReader.remainderOf`.
 */

const CHARGED = 1_200;

function ledger(paid: boolean, lines: readonly CardRefundLine[] = []): CardRefundLedger {
  return CardRefundLedger.rehydrate({
    paymentId: "pay_1",
    subject: PaymentSubject.of("order", "ord_1"),
    account: "lfc-stripe",
    paymentRef: "pi_2",
    amountCents: CHARGED,
    paid,
    lines,
  });
}

const SUCCEEDED_300: CardRefundLine = {
  id: "ref_1",
  requestId: "req_0",
  nature: "adjustment",
  source: "provider",
  providerRef: "re_1",
  amountCents: 300,
  currency: "eur",
  status: "succeeded",
  refundedAt: AT,
  recordedAt: AT,
  updatedAt: AT,
};

describe("refundableCentsOf", () => {
  it("un paiement encaissé sans remboursement : tout le complément", () => {
    expect(refundableCentsOf(ledger(true), [])).toBe(CHARGED);
  });

  it("un paiement non encaissé : rien", () => {
    expect(refundableCentsOf(ledger(false), [])).toBe(0);
  });

  it("retranche les remboursements réussis", () => {
    expect(refundableCentsOf(ledger(true, [SUCCEEDED_300]), [])).toBe(900);
  });

  it("retranche une `amount` ouverte et une `remainder` en cours, déjà annoncées", () => {
    const amount = inState("to_issue", { form: "amount", amountCents: 200, announcedCents: 200 });
    const remainder = inState("issued", { id: "req_2", announcedCents: 500 });
    expect(refundableCentsOf(ledger(true), [amount, remainder])).toBe(500);
  });

  it("une demande terminée n'annonce plus rien", () => {
    const done = inState("refunded", { form: "amount", amountCents: 200, announcedCents: 200 });
    expect(refundableCentsOf(ledger(true), [done])).toBe(CHARGED);
  });

  it("jamais négatif", () => {
    const remainder = inState("to_issue", { announcedCents: 5_000 });
    expect(refundableCentsOf(ledger(true), [remainder])).toBe(0);
  });
});
