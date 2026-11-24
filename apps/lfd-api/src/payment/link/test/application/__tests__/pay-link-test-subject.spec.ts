import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { SubjectRefundOutcome } from "../../../../channels/subjects/index.js";
import { PayLinkTestNotFoundError } from "../../domain/errors/pay-link-test-errors.js";
import { PAY_LINK_TEST_PAYABLE_MS, PayLinkTest } from "../../domain/pay-link-test.js";
import { payLinkTestSubject } from "../../domain/pay-link-test-subject.js";
import { PayLinkTestBell } from "../pay-link-test-bell.js";
import { PayLinkTestLinkable } from "../pay-link-test-linkable.js";
import { PayLinkTestRefundOutcomes } from "../pay-link-test-refund-outcomes.js";
import { PayLinkTestSettlement } from "../pay-link-test-settlement.js";
import { InMemoryPayLinkTests, positionOf, RecordingNotifier } from "./pay-link-test-doubles.js";

/** L'envoi et l'horloge ne sont comparés qu'entre eux. */
const SENT = new Date("2026-03-02T10:00:00.000Z");
const SUBJECT = payLinkTestSubject("plt_1");

function world() {
  const tests = new InMemoryPayLinkTests();
  const clock = new FixedClock(new Date(SENT.getTime() + 60_000));
  const notifier = new RecordingNotifier();
  const outcomes = new PayLinkTestRefundOutcomes(
    tests,
    new PayLinkTestBell(notifier, clock),
    clock,
  );
  return {
    tests,
    clock,
    notifier,
    settlement: new PayLinkTestSettlement(tests, outcomes, clock),
    linkable: new PayLinkTestLinkable(tests, clock),
  };
}

async function seeded(): Promise<ReturnType<typeof world>> {
  const w = world();
  await w.tests.add(
    PayLinkTest.send({ id: "plt_1", createdAt: SENT, createdByStaffId: "staff_1" }),
  );
  return w;
}

async function paid(): Promise<ReturnType<typeof world>> {
  const w = await seeded();
  await w.settlement.onPaid(SUBJECT, "pay_1", 100, "first");
  return w;
}

const base = { position: positionOf(SUBJECT, 100, 0), requestId: "req_1" } as const;

describe("« combien, et pour qui ? » d'un essai", () => {
  it("1 €, un payeur fixe, le libellé de l'essai, l'origine d'essai", async () => {
    const w = await seeded();
    expect(await w.linkable.quote(SUBJECT)).toEqual({
      payable: true,
      amountCents: 100,
      payeeName: "Essai — La Folie Coffee",
      payerName: "Essai du paiement par lien",
      reference: "ESSAI — lien de paiement de 1 €",
      dueOn: null,
    });
  });

  it("plus payable après 24 heures, ni une fois payé", async () => {
    const w = await seeded();
    w.clock.set(new Date(SENT.getTime() + PAY_LINK_TEST_PAYABLE_MS));
    expect(await w.linkable.quote(SUBJECT)).toEqual({ payable: false, reason: "cancelled" });

    const p = await paid();
    expect(await p.linkable.quote(SUBJECT)).toEqual({ payable: false, reason: "settled" });
  });

  it("un essai inconnu est refusé", async () => {
    await expect(world().linkable.quote(SUBJECT)).rejects.toThrow(PayLinkTestNotFoundError);
  });
});

describe("l'essai, sujet de l'encaissement", () => {
  it("payé : `applied`, puis `already_applied` au rejeu ; un complément est refusé", async () => {
    const w = await seeded();
    expect(await w.settlement.onPaid(SUBJECT, "pay_1", 100, "first")).toBe("applied");
    expect(await w.settlement.onPaid(SUBJECT, "pay_1", 100, "first")).toBe("already_applied");
    expect(await w.settlement.onPaid(SUBJECT, "pay_2", 100, "complement")).toBe("refused");
    expect(w.tests.rows.get("plt_1")).toMatchObject({ state: "paid", paidAt: w.clock.now() });
  });

  it("annulé seulement après ses 24 heures", async () => {
    const w = await seeded();
    expect(await w.settlement.isCancelled(SUBJECT)).toBe(false);
    w.clock.set(new Date(SENT.getTime() + PAY_LINK_TEST_PAYABLE_MS));
    expect(await w.settlement.isCancelled(SUBJECT)).toBe(true);
  });

  it("se décrit comme un essai, vers son écran ; ne revendique rien", async () => {
    const w = await seeded();
    expect(await w.settlement.describe()).toEqual({
      label: "ESSAI — lien de paiement de 1 €",
      link: "/comptabilite/lien-de-paiement-d-essai",
    });
    expect(await w.settlement.claim()).toBeNull();
    expect(await w.settlement.referencesSince()).toEqual([]);
  });
});

describe("l'issue du remboursement d'un essai", () => {
  const succeeded = (refunded: number): SubjectRefundOutcome => ({
    ...base,
    position: positionOf(SUBJECT, 100, refunded),
    kind: "succeeded",
    refundId: "rf_1",
    providerRef: "re_1",
    amountCents: refunded,
    currency: "eur",
  });

  it("en attente de la banque : rien ne change", async () => {
    const w = await paid();
    await w.settlement.onRefundOutcome(SUBJECT, {
      ...base,
      kind: "recorded",
      refundId: "rf_1",
      providerRef: "re_1",
      amountCents: 100,
      currency: "eur",
      status: "pending",
    });
    expect(w.tests.rows.get("plt_1")?.state).toBe("paid");
  });

  it("rendu en entier : `refunded`, sans cloche", async () => {
    const w = await paid();
    await w.settlement.onRefundOutcome(SUBJECT, succeeded(100));
    expect(w.tests.rows.get("plt_1")).toMatchObject({ state: "refunded" });
    expect(w.notifier.notices).toEqual([]);
  });

  it("rendu en partie seulement : reste payé", async () => {
    const w = await paid();
    await w.settlement.onRefundOutcome(SUBJECT, succeeded(40));
    expect(w.tests.rows.get("plt_1")?.state).toBe("paid");
  });

  it("échoué : `refund_failed` et la cloche, une clé par remboursement", async () => {
    const w = await paid();
    const failed: SubjectRefundOutcome = {
      ...base,
      kind: "failed",
      refundId: "rf_1",
      providerRef: "re_1",
      amountCents: 100,
      currency: "eur",
      status: "failed",
    };
    await w.settlement.onRefundOutcome(SUBJECT, failed);

    expect(w.tests.rows.get("plt_1")?.state).toBe("refund_failed");
    expect(w.notifier.notices).toMatchObject([
      {
        kind: "pay_link_test.refund_failed",
        link: "/comptabilite/lien-de-paiement-d-essai",
        idempotencyKey: "notification:pay_link_test.refund_failed:plt_1:rf_1",
      },
    ]);
  });

  it("un essai d'émission raté ne touche pas l'essai : le bloc réessaie et sonne lui-même", async () => {
    const w = await paid();
    await w.settlement.onRefundOutcome(SUBJECT, {
      ...base,
      kind: "attempted",
      generation: 1,
      failure: "unavailable",
      providerRef: null,
    });
    expect(w.tests.rows.get("plt_1")?.state).toBe("paid");
    expect(w.notifier.notices).toEqual([]);
  });
});
