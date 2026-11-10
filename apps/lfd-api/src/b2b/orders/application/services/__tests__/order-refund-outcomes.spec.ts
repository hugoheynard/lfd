import type {
  SubjectRefundOutcome,
  SubjectRefundOutcomeDraft,
} from "../../../../../card-payment/channels/subjects/index.js";
import type { SubjectRefundPosition } from "../../../../../card-payment/channels/requests/index.js";
import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  ORDER_REFUND_FAILED,
  ORDER_REFUND_REVERSED,
  OrderRefundFailedFact,
} from "../../../domain/events/order-refund-failed.fact.js";
import { OrderRefundRejectedEvent } from "../../../domain/events/order-refund-rejected.event.js";
import { OrderRefundSucceededFact } from "../../../domain/events/order-refund-succeeded.fact.js";
import { RecordingDurable } from "../../commands/__tests__/durable-doubles.js";
import { OrderRefundOutcomes } from "../order-refund-outcomes.js";
import { FixedStandings, standing } from "./order-card-doubles.js";
import { RecordingRefundStatus } from "./order-refund-outcome-doubles.js";

const ORDER = { type: "order", id: "ord_1" } as const;

/** La position après l'écriture : encaissé, remboursé. */
function position(chargedCents: number, refundedCents: number): SubjectRefundPosition {
  return {
    subject: ORDER,
    chargedCents,
    refundedCents,
    refundedByNature: { return: refundedCents, adjustment: 0, unattributed: 0 },
    inFlightByForm: { remainder: 0, amount: 0, unattributed: 0 },
  };
}

function outcome(
  draft: SubjectRefundOutcomeDraft,
  at: SubjectRefundPosition = position(2_340, 0),
): SubjectRefundOutcome {
  return { ...draft, position: at };
}

function build(paymentStatus: "paid" | "refunded" | "failed" = "paid") {
  const journal = new RecordingJournal();
  const durable = new RecordingDurable();
  const status = new RecordingRefundStatus(paymentStatus);
  const afterCommit = new HeldAfterCommit();
  const events = new RecordingPublisher();
  const outcomes = new OrderRefundOutcomes(
    new FixedStandings([standing()]),
    status,
    journal,
    durable,
    afterCommit,
    events,
  );
  return { journal, durable, status, afterCommit, events, outcomes };
}

const LINE = { refundId: "ref_1", providerRef: "re_1", amountCents: 2_340, currency: "eur" };

/**
 * **L'issue d'un remboursement par carte, côté commande** (plan M2, §3.3,
 * §3.6, lot P1.b) — par genre : la vue, les faits durables, l'événement en
 * mémoire après validation, le journal. Ce que faisaient le constat d'`orders`
 * et `order-refund-facts.ts`, rendu par `card-payment` au canal.
 */
describe("OrderRefundOutcomes", () => {
  it("recorded : `order.refund_recorded` au statut d'attente, le cumul tiré de la position", async () => {
    const { journal, durable, status, outcomes } = build();

    await outcomes.apply(
      ORDER,
      outcome(
        { kind: "recorded", requestId: "req_1", ...LINE, status: "pending" },
        position(2_340, 500),
      ),
    );

    expect(journal.facts).toEqual([
      {
        type: "order.refund_recorded",
        subjectType: "order",
        subjectId: "ord_1",
        payload: {
          subjectLabel: "ORD-0001",
          amountCents: 2_340,
          refundedCents: 500,
          status: "pending",
        },
      },
    ]);
    expect(durable.facts).toEqual([]);
    expect(status.calls).toEqual([]);
  });

  it("succeeded au total, commande `paid` : `refunded`, `order.refund_succeeded` et `order.fully_refunded`", async () => {
    const { journal, durable, status, outcomes } = build("paid");

    await outcomes.apply(
      ORDER,
      outcome({ kind: "succeeded", requestId: "req_1", ...LINE }, position(2_340, 2_340)),
    );

    expect(status.paymentStatus).toBe("refunded");
    expect(durable.facts).toEqual([new OrderRefundSucceededFact("ord_1", "ref_1").durableFact()]);
    expect(journal.types()).toEqual(["order.refund_recorded", "order.fully_refunded"]);
    expect(journal.facts[1]?.payload).toEqual({ subjectLabel: "ORD-0001", refundedCents: 2_340 });
  });

  it("succeeded partiel : la commande reste `paid`, pas de `fully_refunded`", async () => {
    const { journal, status, outcomes } = build("paid");

    await outcomes.apply(
      ORDER,
      outcome(
        { kind: "succeeded", requestId: null, ...LINE, amountCents: 1_000 },
        position(2_340, 1_000),
      ),
    );

    expect(status.calls).toEqual([]);
    expect(journal.types()).toEqual(["order.refund_recorded"]);
  });

  /**
   * La règle de `settle()` : une annulée encaissée après coup reste `failed` —
   * c'est le remboursement qui la solde, la vue ne la dit pas « remboursée ».
   */
  it("succeeded au total sur une commande `failed` : rien ne franchit, pas de `fully_refunded`", async () => {
    const { journal, status, outcomes } = build("failed");

    await outcomes.apply(
      ORDER,
      outcome({ kind: "succeeded", requestId: "req_1", ...LINE }, position(2_340, 2_340)),
    );

    expect(status.paymentStatus).toBe("failed");
    expect(journal.types()).toEqual(["order.refund_recorded"]);
  });

  it("settled_elsewhere : comme un remboursement réussi — l'avoir se décide sur le même fait", async () => {
    const { durable, status, outcomes } = build("paid");

    await outcomes.apply(
      ORDER,
      outcome(
        {
          kind: "settled_elsewhere",
          requestId: "req_1",
          refundId: "ref_manual",
          amountCents: 2_340,
          staffId: "staff_1",
          reason: "Virement fait le jour même",
        },
        position(2_340, 2_340),
      ),
    );

    expect(durable.facts).toEqual([
      new OrderRefundSucceededFact("ord_1", "ref_manual").durableFact(),
    ]);
    expect(status.paymentStatus).toBe("refunded");
  });

  it("failed : `order.refund_failed` avec la ligne et le `re_…`, la vue ne bouge pas", async () => {
    const { durable, status, journal, outcomes } = build("paid");

    await outcomes.apply(
      ORDER,
      outcome({ kind: "failed", requestId: "req_1", ...LINE, status: "canceled" }),
    );

    expect(durable.facts).toEqual([
      new OrderRefundFailedFact(ORDER_REFUND_FAILED, "ord_1", "ref_1", "re_1").durableFact(),
    ]);
    expect(journal.facts[0]?.payload).toMatchObject({ status: "canceled" });
    expect(status.calls).toEqual([]);
  });

  it("reversed : `order.refund_reversed`, et la commande `refunded` redevient `paid`", async () => {
    const { durable, status, outcomes } = build("refunded");

    await outcomes.apply(
      ORDER,
      outcome(
        { kind: "reversed", requestId: "req_1", ...LINE, status: "failed" },
        position(2_340, 0),
      ),
    );

    expect(durable.facts).toEqual([
      new OrderRefundFailedFact(ORDER_REFUND_REVERSED, "ord_1", "ref_1", "re_1").durableFact(),
    ]);
    expect(status.paymentStatus).toBe("paid");
  });

  it("🔴 rejected : journal tout de suite, l'événement en mémoire APRÈS validation seulement", async () => {
    const { journal, events, afterCommit, durable, outcomes } = build();

    await outcomes.apply(
      ORDER,
      outcome({
        kind: "rejected",
        requestId: null,
        providerRef: "re_9",
        amountCents: 500,
        currency: "usd",
        status: "succeeded",
        reason: "currency",
      }),
    );

    expect(journal.facts[0]).toMatchObject({
      type: "order.refund_rejected",
      payload: { subjectLabel: "ORD-0001", amountCents: 500, currency: "usd", reason: "currency" },
    });
    expect(events.published).toEqual([]);
    await afterCommit.commit();
    expect(events.published).toEqual([
      new OrderRefundRejectedEvent("ord_1", "ORD-0001", "re_9", 500, "currency"),
    ]);
    expect(durable.facts).toEqual([]);
  });

  it("attempted : `order.refund_attempt_failed`, génération et code brut", async () => {
    const { journal, outcomes } = build();

    await outcomes.apply(
      ORDER,
      outcome({
        kind: "attempted",
        requestId: "req_1",
        generation: 2,
        failure: "declined:expired_card",
        providerRef: null,
      }),
    );

    expect(journal.facts[0]?.payload).toEqual({
      subjectLabel: "ORD-0001",
      generation: 2,
      failure: "declined:expired_card",
    });
  });

  it("issued au montant annoncé : rien au journal de la commande — seul l'écart s'y écrit", async () => {
    const { journal, outcomes } = build();
    const issued = {
      kind: "issued",
      requestId: "req_1",
      generation: 1,
      providerRef: "re_1",
      announcedCents: 2_340,
    } as const;

    await outcomes.apply(ORDER, outcome({ ...issued, issuedCents: 2_340 }));
    expect(journal.facts).toEqual([]);

    await outcomes.apply(ORDER, outcome({ ...issued, issuedCents: 1_340 }));
    expect(journal.facts).toEqual([
      {
        type: "order.refund_issued",
        subjectType: "order",
        subjectId: "ord_1",
        payload: { subjectLabel: "ORD-0001", announcedCents: 2_340, issuedCents: 1_340 },
      },
    ]);
  });

  it("une commande inconnue : refusée, rien d'écrit", async () => {
    const { journal, outcomes } = build();

    await expect(
      outcomes.apply(
        { type: "order", id: "ord_absente" },
        outcome({ kind: "succeeded", requestId: null, ...LINE }),
      ),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(journal.facts).toEqual([]);
  });
});
