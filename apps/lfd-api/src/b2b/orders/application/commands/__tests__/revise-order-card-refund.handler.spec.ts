import { RevisionProposalPendingError } from "../../../domain/errors/card-increase-proposal-errors.js";
import { CardOrderNotRevisableError } from "../../../domain/errors/order-revision-errors.js";
import { CardRefundNotCoveredError } from "../../../domain/errors/revision-card-refund-errors.js";
import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import { proposalAt } from "../../services/__tests__/card-increase-doubles.js";
import { REVISION_REFUND_REASON } from "../../services/revision-card-refund.js";
import { ReviseOrderCommand } from "../revise-order.command.js";
import { paidLine, type CardRefundSetup } from "./revision-card-refund-doubles.js";
import { content, placedOrder, reviseScene } from "./revision-scene.js";

/**
 * **M1 sur une carte encaissée qui baisse** (plan
 * `documentation/commandes/modification/plan-s1-la-baisse.md`, R3 à R6) —
 * l'ordre nommé : hors verrou, aucun projet vivant ; sous le verrou, le
 * projet rejugé, le premier paiement adopté, les restes lus, la répartition ;
 * PUIS l'écriture ; PUIS une demande `amount` par paiement touché. Un refus
 * n'écrit rien.
 */

const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;
const STAFF = { kind: "staff", staffId: "stf_1" } as const;
const LESS = content({ lines: [{ sku: "VIE-001", quantity: 5 }] });
const SAME = content({ note: "porte B" });

async function paidOrder(): Promise<RevisableOrder> {
  return placedOrder({ paymentStatus: "paid", stripePaymentIntentId: "pi_1" });
}

/** La scène d'une carte encaissée : un premier paiement du montant de la commande. */
function cardScene(order: RevisableOrder, card: CardRefundSetup = {}) {
  return reviseScene(order, {
    card: { payments: [paidLine("pay_1", order.totalCents)], ...card },
  });
}

function indexOf(trace: readonly string[], prefix: string): number {
  return trace.findIndex((step) => step.startsWith(prefix));
}

describe("ReviseOrderHandler — la baisse d'une carte encaissée (plan S1)", () => {
  it("lit, refuse, écrit, PUIS demande — le montant venu du règlement", async () => {
    const order = await paidOrder();
    const { handler, asSeen, trace, revisions, cardRefunds } = cardScene(order);

    const result = await handler.execute(await asSeen("ord_1", CUSTOMER, 0, LESS));

    const refundCents = order.totalCents - result.totalCents;
    expect(refundCents).toBeGreaterThan(0);
    expect(cardRefunds.amounts).toEqual([
      {
        paymentId: "pay_1",
        amountCents: refundCents,
        nature: "adjustment",
        reason: REVISION_REFUND_REASON,
        requestedBy: null,
      },
    ]);
    expect(revisions.saved).toHaveLength(1);
    const order_ = [
      "liveOf:",
      "lock:",
      "lockLiveOf:",
      "ensureFirst:",
      "appliedPaymentsOf:",
      "positionOf",
      "remainderOf:pay_1",
      "save:",
      "requestAmount:pay_1",
    ].map((step) => indexOf(trace, step));
    expect(order_.every((at) => at >= 0)).toBe(true);
    expect([...order_].sort((a, b) => a - b)).toEqual(order_);
  });

  it("l'équipe baisse aussi, et la demande porte sa fiche", async () => {
    const order = await paidOrder();
    const { handler, asSeen, cardRefunds } = cardScene(order);

    await handler.execute(await asSeen("ord_1", STAFF, 0, LESS));

    expect(cardRefunds.amounts.map((request) => request.requestedBy)).toEqual(["stf_1"]);
  });

  it("R9 : après une hausse appliquée, rend d'abord sur le complément", async () => {
    const order = await paidOrder();
    const { handler, asSeen, cardRefunds } = cardScene(order, {
      payments: [paidLine("pay_1", 2_000), paidLine("pay_2", order.totalCents, "complement")],
      applied: ["pay_2"],
    });

    await handler.execute(await asSeen("ord_1", CUSTOMER, 0, LESS));

    expect(cardRefunds.amounts.map((request) => request.paymentId)).toEqual(["pay_2"]);
  });

  it("R4 : un complément d'un projet non appliqué n'est jamais rendu", async () => {
    const order = await paidOrder();
    const { handler, asSeen, cardRefunds } = cardScene(order, {
      payments: [paidLine("pay_1", order.totalCents), paidLine("pay_2", 5_000, "complement")],
      applied: [],
    });

    await handler.execute(await asSeen("ord_1", CUSTOMER, 0, LESS));

    expect(cardRefunds.amounts.map((request) => request.paymentId)).toEqual(["pay_1"]);
  });

  it("deux paiements touchés : deux demandes, après l'écriture", async () => {
    const order = await paidOrder();
    const { handler, asSeen, cardRefunds, trace } = cardScene(order, {
      payments: [paidLine("pay_1", order.totalCents), paidLine("pay_2", 100, "complement")],
      applied: ["pay_2"],
    });

    const result = await handler.execute(await asSeen("ord_1", CUSTOMER, 0, LESS));

    const refundCents = order.totalCents - result.totalCents;
    expect(cardRefunds.amounts.map((request) => [request.paymentId, request.amountCents])).toEqual([
      ["pay_2", 100],
      ["pay_1", refundCents - 100],
    ]);
    expect(indexOf(trace, "save:")).toBeLessThan(indexOf(trace, "requestAmount:"));
  });

  it("Q2 : un total égal sur une carte passe, sans aucune demande", async () => {
    const order = await paidOrder();
    const { handler, asSeen, revisions, cardRefunds, trace } = cardScene(order);

    await handler.execute(await asSeen("ord_1", CUSTOMER, 0, SAME));

    expect(revisions.saved).toHaveLength(1);
    expect(cardRefunds.amounts).toEqual([]);
    expect(indexOf(trace, "lockLiveOf:")).toBeGreaterThanOrEqual(0);
    expect(indexOf(trace, "ensureFirst:")).toBe(-1);
  });

  it("une commande au compte ne touche ni aux projets ni à la carte", async () => {
    const order = await placedOrder();
    const { handler, asSeen, trace } = cardScene(order);

    await handler.execute(
      await asSeen("ord_1", CUSTOMER, 0, content({ lines: [{ sku: "VIE-001", quantity: 5 }] })),
    );

    expect(trace.filter((step) => /liveOf|ensureFirst|requestAmount/i.test(step))).toEqual([]);
  });
});

describe("ReviseOrderHandler — les refus de la baisse, sans aucune écriture (plan S1)", () => {
  it.each(["awaiting_payment", "ready", "stalled"] as const)(
    "R3 : un projet %s refuse hors verrou, avec la phrase existante",
    async (state) => {
      const order = await paidOrder();
      const { handler, asSeen, trace, revisions, cardRefunds } = cardScene(order, {
        live: proposalAt(state),
      });
      const command = await asSeen("ord_1", CUSTOMER, 0, LESS);

      const attempt = handler.execute(command);

      await expect(attempt).rejects.toBeInstanceOf(RevisionProposalPendingError);
      await expect(attempt).rejects.toMatchObject({ code: "orders.card_increase.pending" });
      expect(indexOf(trace, "lock:")).toBe(-1);
      expect(revisions.saved).toEqual([]);
      expect(cardRefunds.amounts).toEqual([]);
    },
  );

  it("R3 : un projet né entre-temps est vu sous le verrou, avant toute écriture", async () => {
    const order = await paidOrder();
    const { handler, asSeen, revisions, cardRefunds, durable } = cardScene(order, {
      liveUnderLock: proposalAt("awaiting_payment"),
    });

    await expect(handler.execute(await asSeen("ord_1", CUSTOMER, 0, LESS))).rejects.toBeInstanceOf(
      RevisionProposalPendingError,
    );
    expect(revisions.saved).toEqual([]);
    expect(durable.facts).toEqual([]);
    expect(cardRefunds.amounts).toEqual([]);
  });

  it("R3 vaut aussi pour un total égal (Q2)", async () => {
    const order = await paidOrder();
    const { handler, asSeen, revisions } = cardScene(order, { live: proposalAt("ready") });

    await expect(handler.execute(await asSeen("ord_1", CUSTOMER, 0, SAME))).rejects.toBeInstanceOf(
      RevisionProposalPendingError,
    );
    expect(revisions.saved).toEqual([]);
  });

  it("R6 : des restes insuffisants refusent sous le verrou, avant l'écriture", async () => {
    const order = await paidOrder();
    const { handler, asSeen, trace, revisions, cardRefunds, durable } = cardScene(order, {
      remainders: { pay_1: 1 },
    });

    await expect(handler.execute(await asSeen("ord_1", CUSTOMER, 0, LESS))).rejects.toBeInstanceOf(
      CardRefundNotCoveredError,
    );
    expect(indexOf(trace, "remainderOf:pay_1")).toBeGreaterThan(indexOf(trace, "lock:"));
    expect(indexOf(trace, "save:")).toBe(-1);
    expect(indexOf(trace, "desk:")).toBe(-1);
    expect(revisions.saved).toEqual([]);
    expect(durable.facts).toEqual([]);
    expect(cardRefunds.amounts).toEqual([]);
  });

  it("R6 : une demande `amount` arrêtée nomme le geste de l'équipe", async () => {
    const order = await paidOrder();
    const { handler, asSeen } = cardScene(order, {
      remainders: { pay_1: 0 },
      openRequests: [
        {
          requestId: "req_9",
          paymentId: "pay_1",
          form: "amount",
          nature: "adjustment",
          state: "stopped",
        },
      ],
    });

    const attempt = handler.execute(await asSeen("ord_1", STAFF, 0, LESS));

    await expect(attempt).rejects.toMatchObject({ stopped: true });
    await expect(attempt).rejects.toThrow("relancez-le ou marquez-le rendu autrement");
  });

  it("R4 : sans premier paiement connu (rien à adopter), le refus le dit au lieu d'écrire", async () => {
    const order = await paidOrder();
    const { handler, asSeen, revisions } = cardScene(order, { adoptedFirst: null });

    await expect(handler.execute(await asSeen("ord_1", CUSTOMER, 0, LESS))).rejects.toBeInstanceOf(
      CardRefundNotCoveredError,
    );
    expect(revisions.saved).toEqual([]);
  });

  it("R1 : une carte déjà rendue en entier est refusée par le règlement", async () => {
    const order = await placedOrder({ paymentStatus: "refunded", stripePaymentIntentId: "pi_1" });
    const { handler, trace } = cardScene(order);

    // Le règlement parle avant le total vu (plan S2, R15) : un total quelconque.
    const attempt = handler.execute(
      new ReviseOrderCommand("ord_1", CUSTOMER, 0, LESS, 0, "direct"),
    );

    await expect(attempt).rejects.toBeInstanceOf(CardOrderNotRevisableError);
    await expect(attempt).rejects.toMatchObject({ reason: "refunded" });
    expect(trace).toEqual([]);
  });
});
