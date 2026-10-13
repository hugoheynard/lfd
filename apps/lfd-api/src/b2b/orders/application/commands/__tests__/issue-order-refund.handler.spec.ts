import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedWallClock } from "../../../../../platform/time/fixed-wall-clock.js";
import type { RefundIssuance, RefundLookup } from "../../../../payments/domain/payment-refunder.js";
import { OrderRefundRejectedEvent } from "../../../domain/events/order-refund-rejected.event.js";
import { RefundAttentionBell } from "../../services/refund-attention-bell.js";
import { RefundIssuanceRecorder } from "../../services/refund-issuance-recorder.js";
import { IssueOrderRefundCommand } from "../issue-order-refund.command.js";
import { IssueOrderRefundHandler, REFUND_LEASE_MS } from "../issue-order-refund.handler.js";
import { RecordingDurable } from "./durable-doubles.js";
import {
  InMemoryLease,
  InMemoryLedgers,
  InMemoryRefundReader,
  InMemoryRefundRequests,
  ORDER_ID,
  RecordingNotifier,
  RefundStore,
  ScriptedRefunder,
  stripeRefund,
} from "./refund-doubles.js";

/**
 * L'exécuteur des remboursements (doc `documentation/commandes/annulation/annulation-par-le-staff.md`,
 * C4.7). Les instants ne sont comparés qu'entre eux — exception étroite du §5.
 */
const START = new Date(Date.UTC(2030, 0, 10, 9));

function build(
  issuances: RefundIssuance[],
  options: { readonly found?: RefundLookup; readonly intent?: string | null } = {},
) {
  const store = new RefundStore();
  store.seedRequest(START);
  const wall = new FixedWallClock(START);
  const clock = new FixedClock(START);
  const notifier = new RecordingNotifier();
  const bell = new RefundAttentionBell(notifier, clock);
  const journal = new RecordingJournal();
  const durable = new RecordingDurable();
  const events = new RecordingPublisher();
  const ids = new FixedIdGenerator("tok");
  const requests = new InMemoryRefundRequests(store);
  const ledgers = new InMemoryLedgers(store);
  const refunder = new ScriptedRefunder(issuances, options.found ?? { kind: "none" });
  const unitOfWork = new DirectUnitOfWork();
  const recorder = new RefundIssuanceRecorder(
    ledgers,
    requests,
    unitOfWork,
    journal,
    durable,
    bell,
    ids,
    clock,
    wall,
  );
  const handler = new IssueOrderRefundHandler(
    new InMemoryLease(store),
    requests,
    new InMemoryRefundReader(store, options.intent === undefined ? "pi_1" : options.intent),
    ledgers,
    refunder,
    recorder,
    bell,
    events,
    unitOfWork,
    ids,
    clock,
    wall,
  );
  const run = () => handler.execute(new IssueOrderRefundCommand(ORDER_ID));
  return { store, wall, notifier, journal, durable, events, refunder, run };
}

const journalTypes = (journal: RecordingJournal) => journal.facts.map((fact) => fact.type);

describe("IssueOrderRefundHandler — émis", () => {
  it("cherche puis crée sous la clé de la génération, note au carnet comme le webhook, relâche le bail", async () => {
    const { store, refunder, journal, notifier, run } = build([
      { kind: "issued", refund: stripeRefund() },
    ]);

    await run();

    expect(refunder.calls).toEqual([
      {
        paymentIntentId: "pi_1",
        key: "lfd-order-refund:ord_1:1:1",
        requestId: ORDER_ID,
        generation: 1,
      },
    ]);
    expect(store.refunds).toMatchObject([{ stripeRefundId: "re_1", status: "pending" }]);
    expect(store.request).toMatchObject({
      stripeRefundId: "re_1",
      issuedAt: START,
      attempts: 1,
      nextAttemptAt: null,
      claimToken: null,
      claimedUntil: null,
    });
    expect(journalTypes(journal)).toEqual(["order.refund_recorded"]);
    expect(notifier.notices).toEqual([]);
  });

  it("réussi d'emblée : le carnet passe la commande `refunded` et publie `order.refund_succeeded`", async () => {
    const { store, durable, run } = build([
      { kind: "issued", refund: stripeRefund({ status: "succeeded" }) },
    ]);

    await run();

    expect(store.paymentStatus).toBe("refunded");
    expect(durable.facts.map((fact) => fact.type)).toEqual(["order.refund_succeeded"]);
  });

  it("le webhook est passé AVANT : le constat est périmé, rien n'est compté deux fois", async () => {
    const { store, journal, run } = build([{ kind: "issued", refund: stripeRefund() }]);
    store.refunds = [
      {
        id: "ref_1",
        stripeRefundId: "re_1",
        amountCents: 2_340,
        currency: "eur",
        status: "pending",
        refundedAt: START,
        recordedAt: START,
        updatedAt: START,
        creditNoteId: null,
      },
    ];

    await run();

    expect(store.refunds).toHaveLength(1);
    expect(journal.facts).toEqual([]);
    expect(store.request?.stripeRefundId).toBe("re_1");
  });

  it("Stripe rend un autre montant que l'annoncé : le journal porte les deux", async () => {
    const { journal, run } = build([
      { kind: "issued", refund: stripeRefund({ amountCents: 1_840 }) },
    ]);

    await run();

    expect(journal.facts).toContainEqual({
      type: "order.refund_issued",
      subjectType: "order",
      subjectId: ORDER_ID,
      payload: { subjectLabel: "CMD-0001", announcedCents: 2_340, issuedCents: 1_840 },
    });
  });
});

describe("IssueOrderRefundHandler — Stripe n'a pas répondu", () => {
  it("compte l'essai, change de round, reporte à l'horloge MURALE, sonne une fois par génération", async () => {
    const { store, wall, notifier, journal, refunder, run } = build([
      { kind: "unavailable", reason: "ECONNRESET" },
      { kind: "unavailable", reason: "ECONNRESET" },
    ]);
    // L'appel dure : le mur avance, l'instant gelé de la requête non.
    refunder.during = () => {
      wall.advanceMs(30_000);
    };

    await run();
    const firstRetry = store.request?.nextAttemptAt;
    wall.set(firstRetry ?? START);
    await run();

    expect(refunder.calls.map((call) => call.key)).toEqual([
      "lfd-order-refund:ord_1:1:1",
      "lfd-order-refund:ord_1:1:2",
    ]);
    expect(firstRetry).toEqual(new Date(START.getTime() + 30_000 + 30_000));
    expect(store.request).toMatchObject({ attempts: 2, round: 3, lastFailure: "unavailable" });
    expect(journalTypes(journal)).toEqual([
      "order.refund_attempt_failed",
      "order.refund_attempt_failed",
    ]);
    expect(notifier.notices.map((notice) => notice.idempotencyKey)).toEqual([
      "notification:order.refund_attention:ord_1:1:unavailable",
    ]);
  });

  it("trois échecs puis un succès : trois essais, quatre rounds, une cloche, un remboursement", async () => {
    const { store, wall, notifier, refunder, run } = build([
      { kind: "unavailable", reason: "5xx" },
      { kind: "unavailable", reason: "5xx" },
      { kind: "unavailable", reason: "5xx" },
      { kind: "issued", refund: stripeRefund() },
    ]);

    for (let turn = 0; turn < 4; turn += 1) {
      wall.set(store.request?.nextAttemptAt ?? START);
      await run();
    }

    expect(refunder.calls.map((call) => call.key.split(":").slice(2).join(":"))).toEqual([
      "1:1",
      "1:2",
      "1:3",
      "1:4",
    ]);
    expect(store.request).toMatchObject({ attempts: 4, round: 4, stripeRefundId: "re_1" });
    expect(notifier.notices).toHaveLength(1);
  });
});

describe("IssueOrderRefundHandler — rejouer ne changerait rien", () => {
  it("`declined` : trace, cloche, et la demande sort du balayage", async () => {
    const { store, notifier, journal, run } = build([
      { kind: "declined", code: "charge_disputed" },
    ]);

    await run();

    expect(store.request).toMatchObject({
      lastFailure: "declined:charge_disputed",
      nextAttemptAt: null,
      claimToken: null,
    });
    expect(journal.facts[0]?.payload).toMatchObject({ failure: "declined:charge_disputed" });
    expect(notifier.notices.map((notice) => notice.subject)).toEqual([
      "Remboursement refusé par Stripe — CMD-0001",
    ]);
  });

  it("`nothing_left` que la recherche n'explique pas : cloche « vérifier le tableau de bord »", async () => {
    const { store, notifier, refunder, run } = build([{ kind: "nothing_left" }]);

    await run();

    expect(refunder.lookups).toHaveLength(1);
    expect(store.request).toMatchObject({ lastFailure: "nothing_left", nextAttemptAt: null });
    expect(notifier.notices[0]?.subject).toContain("Rien à rembourser chez Stripe");
  });

  it("`nothing_left` puis la recherche trouve le re_… de la génération : c'est une émission", async () => {
    const { store, notifier, run } = build([{ kind: "nothing_left" }], {
      found: { kind: "found", refund: stripeRefund({ status: "succeeded" }) },
    });

    await run();

    expect(store.request?.stripeRefundId).toBe("re_1");
    expect(store.paymentStatus).toBe("refunded");
    expect(notifier.notices).toEqual([]);
  });

  it("`nothing_left` quand le carnet dit déjà tout rendu : ni cloche, ni échec écrit", async () => {
    const { store, notifier, run } = build([{ kind: "nothing_left" }]);
    store.refunds = [
      {
        id: "ref_9",
        stripeRefundId: "re_dash",
        amountCents: 2_340,
        currency: "eur",
        status: "succeeded",
        refundedAt: START,
        recordedAt: START,
        updatedAt: START,
        creditNoteId: null,
      },
    ];

    await run();

    expect(notifier.notices).toEqual([]);
    expect(store.request).toMatchObject({ lastFailure: null, claimToken: null });
  });

  it("le carnet refuse (`exceeds_charge`) : comme le webhook — journal, cloche existante, plus de rejeu", async () => {
    const { store, events, journal, run } = build([
      { kind: "issued", refund: stripeRefund({ status: "succeeded", amountCents: 9_999 }) },
    ]);

    await run();

    expect(journalTypes(journal)).toEqual(["order.refund_rejected"]);
    expect(events.published).toEqual([
      new OrderRefundRejectedEvent(ORDER_ID, "CMD-0001", "re_1", 9_999, "exceeds_charge"),
    ]);
    expect(store.request).toMatchObject({
      stripeRefundId: null,
      lastFailure: "rejected:exceeds_charge",
      nextAttemptAt: null,
    });
    expect(store.refunds).toEqual([]);
  });
});

describe("IssueOrderRefundHandler — un seul exécuteur à la fois", () => {
  it("bail tenu par un autre : aucun appel", async () => {
    const { store, refunder, run } = build([{ kind: "issued", refund: stripeRefund() }]);
    store.request = {
      ...(store.request ?? fail()),
      claimToken: "autre",
      claimedUntil: new Date(START.getTime() + REFUND_LEASE_MS),
    };

    await run();

    expect(refunder.calls).toEqual([]);
    expect(store.request.claimToken).toBe("autre");
  });

  it("bail ÉCHU : repris", async () => {
    const { store, refunder, run } = build([{ kind: "issued", refund: stripeRefund() }]);
    store.request = {
      ...(store.request ?? fail()),
      claimToken: "mort",
      claimedUntil: new Date(START.getTime() - 1),
    };

    await run();

    expect(refunder.calls).toHaveLength(1);
  });

  it("demande déjà émise (re_… en attente) : aucun appel, bail relâché", async () => {
    const { store, refunder, run } = build([{ kind: "issued", refund: stripeRefund() }]);
    store.request = { ...(store.request ?? fail()), stripeRefundId: "re_1", issuedAt: START };
    store.refunds = [
      {
        id: "ref_1",
        stripeRefundId: "re_1",
        amountCents: 2_340,
        currency: "eur",
        status: "pending",
        refundedAt: START,
        recordedAt: START,
        updatedAt: START,
        creditNoteId: null,
      },
    ];

    await run();

    expect(refunder.calls).toEqual([]);
    expect(store.request?.claimToken).toBeNull();
  });

  it("le bail a expiré pendant l'appel et un autre l'a repris : la demande n'est pas réécrite, le carnet si", async () => {
    const { store, refunder, run } = build([{ kind: "issued", refund: stripeRefund() }]);
    refunder.during = () => {
      store.request = { ...(store.request ?? fail()), claimToken: "repreneur" };
    };

    await run();

    expect(store.refunds).toMatchObject([{ stripeRefundId: "re_1" }]);
    expect(store.request).toMatchObject({ claimToken: "repreneur", stripeRefundId: null });
  });

  it("le bail se mesure à l'horloge murale : 5 minutes après son instant", async () => {
    const { store, refunder, run } = build([{ kind: "issued", refund: stripeRefund() }]);
    let leased: Date | null = null;
    refunder.during = () => {
      leased = store.request?.claimedUntil ?? null;
    };

    await run();

    expect(leased).toEqual(new Date(START.getTime() + REFUND_LEASE_MS));
  });
});

describe("IssueOrderRefundHandler — génération suivante", () => {
  it("le re_… courant a échoué : génération 2, une clé neuve, un second re_…", async () => {
    const { store, refunder, run } = build([
      { kind: "issued", refund: stripeRefund({ refundId: "re_2" }) },
    ]);
    store.request = { ...(store.request ?? fail()), stripeRefundId: "re_1", issuedAt: START };
    store.refunds = [
      {
        id: "ref_1",
        stripeRefundId: "re_1",
        amountCents: 2_340,
        currency: "eur",
        status: "failed",
        refundedAt: START,
        recordedAt: START,
        updatedAt: START,
        creditNoteId: null,
      },
    ];

    await run();

    expect(refunder.calls).toEqual([
      {
        paymentIntentId: "pi_1",
        key: "lfd-order-refund:ord_1:2:1",
        requestId: ORDER_ID,
        generation: 2,
      },
    ]);
    expect(store.request).toMatchObject({ generation: 2, stripeRefundId: "re_2" });
    expect(store.refunds.map((refund) => refund.stripeRefundId)).toEqual(["re_1", "re_2"]);
  });
});

function fail(): never {
  throw new Error("la demande semée manque");
}
