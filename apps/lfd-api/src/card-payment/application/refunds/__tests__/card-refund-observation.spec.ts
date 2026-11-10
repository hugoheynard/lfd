import type { RefundEvent } from "../../../domain/ports/card-provider-event.js";
import { PaymentAccount } from "../../../domain/value-objects/payment-account.js";
import {
  CHARGED,
  NOW,
  refundHarness,
  seedLine,
  seedPayment,
  seedRequest,
  type RefundHarness,
} from "./card-refund-harness.js";

const ACCOUNT = PaymentAccount.of("lfc-stripe");

function event(overrides: Partial<RefundEvent> = {}): RefundEvent {
  return {
    kind: "refund",
    eventId: "evt_1",
    eventType: "refund.updated",
    providerRef: "pi_1",
    refundId: "re_1",
    amountCents: CHARGED,
    currency: "eur",
    status: "succeeded",
    createdAt: NOW,
    ...overrides,
  };
}

const observe = (h: RefundHarness, overrides: Partial<RefundEvent> = {}) =>
  h.observation.observe(ACCOUNT, event(overrides));

const kinds = (h: RefundHarness) => h.settlement.refundOutcomes.map((outcome) => outcome.kind);

/** Une demande émise sur `re_1` — l'exécuteur est passé. */
function issuedRequest(h: RefundHarness): void {
  seedRequest(h);
  const row = h.store.request("req_1");
  if (row !== undefined) {
    h.store.seedRequest({
      ...row,
      state: "issued",
      providerRef: "re_1",
      issuedAt: NOW,
      attempts: 1,
    });
  }
}

/**
 * **Le constat d'un remboursement** (plan M2, §3.4, §6.2, §6.3) — sans bail,
 * une transaction, l'ordre du §3.6 ; la demande retrouvée par son `re_…` ou
 * par la métadonnée de l'événement.
 */
describe("CardRefundObservation — l'ordre et la position", () => {
  it("🔴 `lockSubject`, le paiement, l'écriture, PUIS le canal — avec la position recalculée APRÈS l'écriture", async () => {
    const h = refundHarness();
    seedPayment(h);
    issuedRequest(h);

    await observe(h);

    expect(h.timeline.steps).toEqual([
      "channel.lockSubject:ord_1",
      "payment.lock:pay_1",
      "ledger.save:pay_1",
      "request.save:req_1:refunded",
      "fact:card_payment.refund_succeeded",
      "fact:card_payment.fully_refunded",
      "channel.onRefundOutcome:ord_1:succeeded",
    ]);
    expect(h.settlement.refundOutcomes[0]).toMatchObject({
      kind: "succeeded",
      requestId: "req_1",
      providerRef: "re_1",
      amountCents: CHARGED,
      currency: "eur",
      position: { chargedCents: CHARGED, refundedCents: CHARGED },
    });
  });

  it("un paiement qu'aucun sujet ne porte : `unmatched`, rien d'écrit", async () => {
    const h = refundHarness();

    await expect(observe(h)).resolves.toBe("unmatched");
    expect(h.timeline.steps).not.toContain("ledger.save:pay_1");
  });

  it("un statut périmé (rejeu, désordre) est IGNORÉ : rien d'écrit, rien au canal", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedLine(h, { providerRef: "re_1", status: "succeeded" });

    await observe(h, { status: "pending" });

    expect(h.timeline.steps).toEqual(["channel.lockSubject:ord_1", "payment.lock:pay_1"]);
    expect(h.settlement.refundOutcomes).toEqual([]);
  });
});

describe("CardRefundObservation — la demande suit son `re_…`", () => {
  it("arrivé AVANT l'exécuteur, retrouvée par la métadonnée : `to_issue → issued`, `re_…` posé", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h);

    await observe(h, { status: "pending", ours: { requestId: "req_1", generation: 1 } });

    expect(h.store.request("req_1")).toMatchObject({
      state: "issued",
      providerRef: "re_1",
      attempts: 0,
    });
    expect(h.store.linesOf("pay_1")).toMatchObject([{ requestId: "req_1", nature: "return" }]);
    expect(kinds(h)).toEqual(["recorded", "issued"]);
    expect(h.journal.types()).toEqual(["card_payment.issued"]);
  });

  it("une AUTRE génération est ignorée : la ligne lui est attribuée, la demande ne bouge pas", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h);
    const row = h.store.request("req_1");
    if (row !== undefined) {
      h.store.seedRequest({ ...row, generation: 2 });
    }

    await observe(h, { status: "pending", ours: { requestId: "req_1", generation: 1 } });

    expect(h.store.request("req_1")?.state).toBe("to_issue");
    expect(h.store.linesOf("pay_1")).toMatchObject([{ requestId: "req_1" }]);
  });

  it("`issued` qui réussit : `refunded`", async () => {
    const h = refundHarness();
    seedPayment(h);
    issuedRequest(h);

    await observe(h);

    expect(h.store.request("req_1")?.state).toBe("refunded");
  });

  it("`issued` qui échoue : arrêtée `refund_failed`, sonnée, `failed` au sujet", async () => {
    const h = refundHarness();
    seedPayment(h);
    issuedRequest(h);

    await observe(h, { status: "failed" });

    expect(h.store.request("req_1")).toMatchObject({
      state: "stopped",
      lastFailure: "refund_failed",
    });
    expect(h.notifier.keys()).toEqual([
      "notification:card_payment.refund_attention:req_1:1:failed",
    ]);
    expect(h.durable.types()).toEqual(["card_payment.refund_failed"]);
    expect(kinds(h)).toEqual(["failed"]);
  });

  it("un `re_…` manuel qui solde le paiement rend la `remainder` à émettre (§6.2), cloche « hors plateforme »", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h);

    await observe(h, { refundId: "re_tableau" });

    expect(h.store.linesOf("pay_1")).toMatchObject([{ requestId: null, nature: null }]);
    expect(h.store.request("req_1")?.state).toBe("refunded");
    expect(h.notifier.keys()).toEqual([
      "notification:card_payment.refund_unattributed:order:ord_1:re_tableau",
    ]);
  });
});

describe("CardRefundObservation — l'inversion (§6.2)", () => {
  it("avec sa demande : `refunded → stopped`, sonnée, `reversed` au sujet et `refund_reversed` durable", async () => {
    const h = refundHarness();
    seedPayment(h);
    issuedRequest(h);
    await observe(h);

    await observe(h, { status: "failed", eventId: "evt_2" });

    expect(h.store.request("req_1")).toMatchObject({ state: "stopped", lastFailure: "reversed" });
    expect(h.notifier.keys()).toEqual([
      "notification:card_payment.refund_attention:req_1:1:reversed",
    ]);
    expect(h.durable.types()).toContain("card_payment.refund_reversed");
    expect(h.settlement.refundOutcomes.at(-1)).toMatchObject({
      kind: "reversed",
      status: "failed",
      position: { refundedCents: 0 },
    });
  });

  it("sans demande, sujet ANNULÉ : une `remainder` née arrêtée (le bouton), et la cloche par `re_…`", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedLine(h, { providerRef: "re_1", status: "succeeded" });
    h.settlement.cancelled.add("ord_1");

    await observe(h, { status: "failed" });

    const created = [...h.store.requests.values()];
    expect(created).toMatchObject([
      { form: "remainder", state: "stopped", reason: "refund_reversed", nextAttemptAt: null },
    ]);
    expect(h.dispatch.afterCommit).toEqual([]);
    expect(h.notifier.keys()).toEqual([
      "notification:card_payment.refund_reversed:order:ord_1:re_1",
    ]);
  });

  it("sans demande, sujet vivant : rien n'est demandé — mais la cloche sonne quand même", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedLine(h, { providerRef: "re_1", status: "succeeded" });

    await observe(h, { status: "failed" });

    expect(h.store.requests.size).toBe(0);
    expect(h.notifier.keys()).toEqual([
      "notification:card_payment.refund_reversed:order:ord_1:re_1",
    ]);
  });

  it("une `stopped` déjà là est LAISSÉE : pas de seconde demande", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedLine(h, { providerRef: "re_1", status: "succeeded" });
    seedRequest(h, { id: "req_old", firstAttemptAt: null });
    h.settlement.cancelled.add("ord_1");

    await observe(h, { status: "failed" });

    expect([...h.store.requests.keys()]).toEqual(["req_old"]);
  });
});

describe("CardRefundObservation — le refus", () => {
  it.each<[string, Partial<RefundEvent>, string]>([
    ["une autre devise", { currency: "usd" }, "currency"],
    ["un cumul au-delà de l'encaissé", { amountCents: CHARGED + 1 }, "exceeds_charge"],
  ])(
    "refuse %s : rien au carnet, `rejected` au sujet, la demande s'arrête",
    async (_, overrides, reason) => {
      const h = refundHarness();
      seedPayment(h);
      issuedRequest(h);

      await observe(h, overrides);

      expect(h.store.linesOf("pay_1")).toEqual([]);
      expect(h.settlement.refundOutcomes).toMatchObject([
        { kind: "rejected", reason, requestId: "req_1" },
      ]);
      expect(h.store.request("req_1")).toMatchObject({
        state: "stopped",
        lastFailure: `rejected:${reason}`,
      });
      expect(h.durable.types()).toEqual([]);
    },
  );
});
