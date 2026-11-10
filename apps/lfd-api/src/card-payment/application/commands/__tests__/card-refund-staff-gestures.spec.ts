import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import {
  CardRefundNotStoppedError,
  CardRefundRequestNotFoundError,
} from "../../../domain/errors/card-refund-errors.js";
import {
  CHARGED,
  refundHarness,
  seedLine,
  seedPayment,
  seedRequest,
  type RefundHarness,
} from "../../refunds/__tests__/card-refund-harness.js";
import { RetryCardRefundCommand } from "../retry-card-refund.command.js";
import { RetryCardRefundHandler } from "../retry-card-refund.handler.js";
import { SettleCardRefundElsewhereCommand } from "../settle-card-refund-elsewhere.command.js";
import { SettleCardRefundElsewhereHandler } from "../settle-card-refund-elsewhere.handler.js";
import { SweepCardRefundsHandler } from "../sweep-card-refunds.handler.js";

function settleHandler(h: RefundHarness): SettleCardRefundElsewhereHandler {
  return new SettleCardRefundElsewhereHandler(
    h.scope,
    h.requests,
    h.ledgers,
    h.effects,
    new FixedIdGenerator("manual"),
    h.clock,
    h.uow,
  );
}

const settle = (h: RefundHarness, requestId = "req_1", reason = "Virement fait le jour même") =>
  settleHandler(h).execute(new SettleCardRefundElsewhereCommand(requestId, "staff_1", reason));

/**
 * **« Rendu autrement »** (plan M2, §5.5) — une ligne `manual`, le canal
 * `settled_elsewhere`, `card_payment.refund_succeeded` : l'argent rendu hors
 * plateforme ferme la demande comme un `re_…`.
 */
describe("SettleCardRefundElsewhereHandler", () => {
  it("une `remainder` arrêtée : le reste du paiement au carnet, en `manual`, et le sujet le sait", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedLine(h, { status: "succeeded", amountCents: 340 });
    seedRequest(h, { firstAttemptAt: null });

    await settle(h);

    expect(h.store.request("req_1")).toMatchObject({
      state: "settled_elsewhere",
      settledByStaffId: "staff_1",
      settledReason: "Virement fait le jour même",
    });
    expect(h.store.linesOf("pay_1").at(-1)).toMatchObject({
      id: "manual_000001",
      source: "manual",
      providerRef: null,
      amountCents: CHARGED - 340,
      status: "succeeded",
      requestId: "req_1",
      nature: "return",
    });
    expect(h.durable.types()).toEqual([
      "card_payment.refund_succeeded",
      "card_payment.fully_refunded",
    ]);
    expect(h.settlement.refundOutcomes).toMatchObject([
      {
        kind: "settled_elsewhere",
        refundId: "manual_000001",
        amountCents: CHARGED - 340,
        staffId: "staff_1",
        reason: "Virement fait le jour même",
        requestId: "req_1",
        position: { refundedCents: CHARGED, chargedCents: CHARGED },
      },
    ]);
    expect(h.journal.facts[0]).toMatchObject({
      type: "card_payment.settled_elsewhere",
      payload: { amountCents: CHARGED - 340, reason: "Virement fait le jour même" },
    });
  });

  it("une `amount` arrêtée : SON montant, pas le reste", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { form: "amount", amountCents: 500, announcedCents: 500, firstAttemptAt: null });

    await settle(h);

    expect(h.store.linesOf("pay_1")).toMatchObject([{ amountCents: 500, source: "manual" }]);
    expect(h.durable.types()).toEqual(["card_payment.refund_succeeded"]);
  });

  it("🔴 le sujet d'abord : `lockSubject`, le paiement, la demande, puis les écritures", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { firstAttemptAt: null });

    await settle(h);

    expect(h.timeline.steps.slice(0, 5)).toEqual([
      "channel.lockSubject:ord_1",
      "payment.lock:pay_1",
      "request.load:req_1",
      "ledger.save:pay_1",
      "request.save:req_1:settled_elsewhere",
    ]);
  });

  it("refusée sur une demande qui n'est pas arrêtée : rien d'écrit", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h);

    await expect(settle(h)).rejects.toBeInstanceOf(CardRefundNotStoppedError);
    expect(h.store.linesOf("pay_1")).toEqual([]);
  });

  it("une demande inconnue : 404", async () => {
    const h = refundHarness();

    await expect(settle(h, "req_absente")).rejects.toBeInstanceOf(CardRefundRequestNotFoundError);
  });
});

describe("RetryCardRefundHandler", () => {
  it("délègue à « Relancer » — la règle, le journal, l'exécuteur après validation", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { firstAttemptAt: null });

    await new RetryCardRefundHandler(h.retrier).execute(new RetryCardRefundCommand("req_1"));

    expect(h.store.request("req_1")?.generation).toBe(2);
    expect(h.journal.types()).toEqual(["card_payment.retried"]);
    expect(h.dispatch.afterCommit).toEqual(["req_1"]);
  });
});

describe("SweepCardRefundsHandler", () => {
  it("reprend les `to_issue` échues une à une ; une panne n'arrête pas les suivantes", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { id: "req_a" });
    seedRequest(h, { id: "req_b", form: "amount", amountCents: 100, announcedCents: 100 });
    seedRequest(h, { id: "req_c", firstAttemptAt: null });
    h.dispatch.issue = (requestId) =>
      requestId === "req_a" ? Promise.reject(new Error("panne")) : Promise.resolve();

    const report = await new SweepCardRefundsHandler(h.sweep, h.dispatch, h.wall).execute();

    expect(report).toEqual({ taken: 2 });
    expect(h.dispatch.now).toEqual(["req_a", "req_b"]);
  });
});
