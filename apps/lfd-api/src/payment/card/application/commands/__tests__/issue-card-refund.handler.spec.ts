import { CardPayment } from "../../../domain/entities/card-payment.js";
import {
  CHARGED,
  NOW,
  refundHarness,
  seedLine,
  seedPayment,
  seedRequest,
} from "../../refunds/__tests__/card-refund-harness.js";
import { issue, issued, kinds, ready } from "./issue-card-refund-bench.js";

/**
 * **L'exécuteur à bail** (plan M2, §3.5, §3.6) — déménagé d'`orders` dans
 * `card-payment`. Le prestataire est doublé au port ; l'ordre des verrous et
 * des écritures se lit dans la chronologie commune.
 */
describe("IssueCardRefundHandler — l'appel", () => {
  it("🔴 l'ordre du §3.6 : le sujet, le paiement, la demande ; puis le prestataire HORS des verrous ; puis les lignes, et le canal en dernier", async () => {
    const h = ready();
    h.provider.issuances.push({ kind: "issued", refund: issued() });

    await issue(h);

    expect(h.timeline.steps).toEqual([
      "channel.lockSubject:ord_1",
      "payment.lock:pay_1",
      "request.load:req_1",
      "channel.lockSubject:ord_1",
      "payment.lock:pay_1",
      "request.load:req_1",
      "ledger.save:pay_1",
      "request.save:req_1:issued",
      "channel.onRefundOutcome:ord_1:recorded",
      "channel.onRefundOutcome:ord_1:issued",
    ]);
    expect(h.provider.calls).toEqual(["refund:pi_1:lfd-card-refund:req_1:1:1"]);
  });

  it("pose le sujet en métadonnée, sans montant pour une `remainder`", async () => {
    const h = ready();
    h.provider.issuances.push({ kind: "issued", refund: issued() });

    await issue(h);

    expect(h.provider.refunds).toEqual([
      {
        key: "lfd-card-refund:req_1:1:1",
        requestId: "req_1",
        generation: 1,
        subjectLabel: "order:ord_1",
        amountCents: null,
      },
    ]);
  });

  it("une `amount` porte son montant", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { form: "amount", amountCents: 500, announcedCents: 500 });
    h.provider.issuances.push({ kind: "issued", refund: issued({ amountCents: 500 }) });

    await issue(h);

    expect(h.provider.refunds[0]?.amountCents).toBe(500);
    expect(h.store.request("req_1")?.state).toBe("issued");
  });

  it("un bail tenu par un autre : rien n'est appelé, rien n'est écrit", async () => {
    const h = ready();
    const row = h.store.request("req_1");
    if (row === undefined) {
      throw new Error("demande semée absente");
    }
    h.store.seedRequest({
      ...row,
      claimedUntil: new Date(NOW.getTime() + 60_000),
      claimToken: "autre",
    });

    await issue(h);

    expect(h.provider.calls).toEqual([]);
    expect(h.timeline.steps).toEqual([]);
  });

  it("une `remainder` attend qu'une `amount` du paiement finisse (§3.5) : bail relâché, aucun appel", async () => {
    const h = ready();
    seedRequest(h, { id: "req_amount", form: "amount", amountCents: 500, announcedCents: 500 });

    await issue(h);

    expect(h.provider.calls).toEqual([]);
    expect(h.store.request("req_1")).toMatchObject({ state: "to_issue", claimToken: null });
  });

  it("une `remainder` d'un paiement déjà tout rendu : `refunded` sans appel (§6.2)", async () => {
    const h = ready();
    seedLine(h, { status: "succeeded", amountCents: CHARGED });

    await issue(h);

    expect(h.provider.calls).toEqual([]);
    expect(h.store.request("req_1")?.state).toBe("refunded");
  });

  it("sans référence chez le prestataire : arrêtée `no_intent`, sonnée, rendue au sujet", async () => {
    const h = refundHarness();
    seedPayment(h, "paid");
    const row = h.payments.rows.get("pay_1");
    if (row === undefined) {
      throw new Error("paiement semé absent");
    }
    // Une ligne sans référence : impossible par `attach`, relue ainsi pour la garde.
    h.payments.seed(CardPayment.rehydrate({ ...row.toPersistence(), providerRef: null }));
    seedRequest(h);

    await issue(h);

    expect(h.provider.calls).toEqual([]);
    expect(h.store.request("req_1")).toMatchObject({ state: "stopped", lastFailure: "no_intent" });
    expect(h.notifier.keys()).toEqual([
      "notification:card_payment.refund_attention:req_1:1:no_intent",
    ]);
    expect(kinds(h)).toEqual(["attempted"]);
  });
});
