import {
  CHARGED,
  refundHarness,
  seedLine,
  seedPayment,
  seedRequest,
} from "../../refunds/__tests__/card-refund-harness.js";
import { issue, issued, kinds, ready } from "./issue-card-refund-bench.js";

/**
 * **L'exécuteur à bail — les issues** (plan M2, table du §3.5) : chaque
 * réponse du prestataire, ce qu'elle fait de la demande, du carnet, du
 * journal, de la cloche et du canal.
 */
describe("IssueCardRefundHandler — les issues (table du §3.5)", () => {
  it("émis `pending` → `issued` : le carnet, `card_payment.issued`, le canal (`recorded`, `issued`)", async () => {
    const h = ready();
    h.provider.issuances.push({ kind: "issued", refund: issued() });

    await issue(h);

    expect(h.store.request("req_1")).toMatchObject({
      state: "issued",
      providerRef: "re_1",
      attempts: 1,
      claimToken: null,
    });
    expect(h.store.linesOf("pay_1")).toMatchObject([
      { providerRef: "re_1", requestId: "req_1", nature: "return", status: "pending" },
    ]);
    expect(h.journal.types()).toEqual(["card_payment.issued"]);
    expect(h.journal.facts[0]?.payload).toEqual({
      subjectLabel: "Commande ord_1",
      generation: 1,
      announcedCents: CHARGED,
      issuedCents: CHARGED,
    });
    expect(kinds(h)).toEqual(["recorded", "issued"]);
    expect(h.durable.types()).toEqual([]);
  });

  it("émis `succeeded` dès la création → `refunded`, `refund_succeeded` et `fully_refunded`", async () => {
    const h = ready();
    h.provider.issuances.push({ kind: "issued", refund: issued({ status: "succeeded" }) });

    await issue(h);

    expect(h.store.request("req_1")?.state).toBe("refunded");
    expect(h.durable.types()).toEqual([
      "card_payment.refund_succeeded",
      "card_payment.fully_refunded",
    ]);
    const succeeded = h.settlement.refundOutcomes.find((outcome) => outcome.kind === "succeeded");
    expect(succeeded?.position).toMatchObject({ chargedCents: CHARGED, refundedCents: CHARGED });
  });

  it("`unavailable` → round + 1, échéance sur la courbe ; cloche au PREMIER échec seulement", async () => {
    const h = ready();

    h.provider.issuances.push({ kind: "unavailable", reason: "ECONNRESET" });
    await issue(h);
    h.wall.advanceMs(10 * 60 * 1000);
    h.provider.issuances.push({ kind: "unavailable", reason: "ECONNRESET" });
    await issue(h);

    expect(h.store.request("req_1")).toMatchObject({
      state: "to_issue",
      attempts: 2,
      round: 3,
      lastFailure: "unavailable",
      claimToken: null,
    });
    expect(h.provider.calls).toEqual([
      "refund:pi_1:lfd-card-refund:req_1:1:1",
      "refund:pi_1:lfd-card-refund:req_1:1:2",
    ]);
    expect(h.notifier.keys()).toEqual([
      "notification:card_payment.refund_attention:req_1:1:unavailable",
    ]);
    expect(h.journal.types()).toEqual([
      "card_payment.attempt_failed",
      "card_payment.attempt_failed",
    ]);
    expect(kinds(h)).toEqual(["attempted", "attempted"]);
  });

  it("`declined` → arrêtée `declined:<code>`, sonnée, plus de reprise", async () => {
    const h = ready();
    h.provider.issuances.push({ kind: "declined", code: "charge_disputed" });

    await issue(h);

    expect(h.store.request("req_1")).toMatchObject({
      state: "stopped",
      lastFailure: "declined:charge_disputed",
      nextAttemptAt: null,
    });
    expect(h.journal.types()).toEqual(["card_payment.stopped"]);
    expect(h.notifier.keys()).toEqual([
      "notification:card_payment.refund_attention:req_1:1:declined",
    ]);
  });

  it("`nothing_left` (charge_already_refunded), un `re_…` à nous retrouvé par la recherche : émise", async () => {
    const h = ready();
    h.provider.issuances.push({ kind: "nothing_left" });
    h.provider.lookup = { kind: "found", refund: issued() };

    await issue(h);

    expect(h.provider.calls).toEqual([
      "refund:pi_1:lfd-card-refund:req_1:1:1",
      "findRefund:pi_1:req_1:1",
    ]);
    expect(h.store.request("req_1")?.state).toBe("issued");
  });

  it("`nothing_left`, le reste couvert par un `re_…` en vol de la demande : émise sur lui", async () => {
    const h = ready();
    seedLine(h, { providerRef: "re_vol", status: "pending", requestId: "req_1", nature: "return" });
    h.provider.issuances.push({ kind: "nothing_left" });

    await issue(h);

    expect(h.store.request("req_1")).toMatchObject({ state: "issued", providerRef: "re_vol" });
    expect(h.notifier.notices).toEqual([]);
  });

  it("`nothing_left`, rien de nôtre en vol (un remboursement manuel) : arrêtée, sonnée", async () => {
    const h = ready();
    h.provider.issuances.push({ kind: "nothing_left" });

    await issue(h);

    expect(h.store.request("req_1")).toMatchObject({
      state: "stopped",
      lastFailure: "nothing_left",
    });
    expect(h.notifier.keys()).toEqual([
      "notification:card_payment.refund_attention:req_1:1:nothing_left",
    ]);
  });

  it("`nothing_left` sur une `amount` : arrêtée (écart), sonnée", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { form: "amount", amountCents: 500, announcedCents: 500 });
    h.provider.issuances.push({ kind: "nothing_left" });

    await issue(h);

    expect(h.store.request("req_1")).toMatchObject({
      state: "stopped",
      lastFailure: "nothing_left",
    });
  });

  it("une `amount` émise pour un autre montant : arrêtée, sonnée `amount_mismatch`", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { form: "amount", amountCents: 500, announcedCents: 500 });
    h.provider.issuances.push({ kind: "issued", refund: issued({ amountCents: 400 }) });

    await issue(h);

    expect(h.store.request("req_1")).toMatchObject({
      state: "stopped",
      lastFailure: "issued_amount_mismatch",
    });
    expect(h.notifier.keys()).toEqual([
      "notification:card_payment.refund_attention:req_1:1:amount_mismatch",
    ]);
  });

  it("le carnet REFUSE le `re_…` (devise) : rien d'écrit au carnet, la demande s'arrête, le sujet reçoit `rejected`", async () => {
    const h = ready();
    h.provider.issuances.push({ kind: "issued", refund: issued({ currency: "usd" }) });

    await issue(h);

    expect(h.store.linesOf("pay_1")).toEqual([]);
    expect(h.store.request("req_1")).toMatchObject({
      state: "stopped",
      lastFailure: "rejected:currency",
    });
    expect(kinds(h)).toEqual(["rejected", "attempted"]);
    // Une cloche par incident : c'est le sujet qui sonne le refus.
    expect(h.notifier.notices).toEqual([]);
  });

  it("le bail perdu pendant l'appel : le constat au carnet est fait, la demande n'est pas écrite", async () => {
    const h = ready();
    h.provider.issuances.push({ kind: "issued", refund: issued() });
    const recordAfterLoss = h.recorder.record.bind(h.recorder);
    h.recorder.record = async (attempt) => {
      const row = h.store.request("req_1");
      if (row !== undefined) {
        h.store.seedRequest({ ...row, claimToken: "un-autre" });
      }
      await recordAfterLoss(attempt);
    };

    await issue(h);

    expect(h.store.linesOf("pay_1")).toHaveLength(1);
    expect(h.store.request("req_1")).toMatchObject({ state: "to_issue", claimToken: "un-autre" });
  });
});
