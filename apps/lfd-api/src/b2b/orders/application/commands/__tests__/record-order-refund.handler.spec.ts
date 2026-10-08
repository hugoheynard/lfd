import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  OrderRefundLedger,
  type LedgerPaymentStatus,
} from "../../../domain/entities/order-refund-ledger.js";
import type { RefundReport } from "../../../domain/entities/order-refund.js";
import { OrderRefundRejectedEvent } from "../../../domain/events/order-refund-rejected.event.js";
import { RefundWithoutOrderEvent } from "../../../domain/events/refund-without-order.event.js";
import { OrderRefundRepository } from "../../../domain/ports/order-refund.repository.js";
import { RecordOrderRefundCommand } from "../record-order-refund.command.js";
import { RecordOrderRefundHandler } from "../record-order-refund.handler.js";
import { RecordingDurable } from "./durable-doubles.js";

/** Le dépôt en mémoire : une commande au plus, rechargée depuis ce qui a été sauvé. */
class InMemoryRefunds extends OrderRefundRepository {
  saves = 0;
  private stored: OrderRefundLedger | null;

  constructor(
    private readonly intent: string,
    paymentStatus: LedgerPaymentStatus | null,
  ) {
    super();
    this.stored =
      paymentStatus === null
        ? null
        : OrderRefundLedger.reconstitute({
            orderId: "ord_1",
            orderNumber: "CMD-1",
            chargedCents: 2_000,
            paymentStatus,
            refunds: [],
          });
  }

  loadByPaymentIntent(paymentIntentId: string): Promise<OrderRefundLedger | null> {
    if (paymentIntentId !== this.intent || this.stored === null) {
      return Promise.resolve(null);
    }
    const { paymentStatus, refunds } = this.stored.toPersistence();
    return Promise.resolve(
      OrderRefundLedger.reconstitute({
        orderId: this.stored.orderId,
        orderNumber: this.stored.orderNumber,
        chargedCents: this.stored.chargedCents,
        paymentStatus,
        refunds,
      }),
    );
  }

  save(ledger: OrderRefundLedger): Promise<void> {
    this.saves += 1;
    this.stored = ledger;
    return Promise.resolve();
  }

  status(): string | undefined {
    return this.stored?.paymentStatus;
  }
}

/** Les instants ne sont comparés qu'entre eux : aucun n'est confronté à l'horloge. */
const STRIPE_AT = new Date("2030-01-10T09:00:00.000Z");

function report(amountCents: number, stripeRefundId = "re_1", currency = "eur"): RefundReport {
  return { stripeRefundId, amountCents, currency, status: "succeeded", refundedAt: STRIPE_AT };
}

function build(paymentStatus: LedgerPaymentStatus | null = "paid") {
  const refunds = new InMemoryRefunds("pi_1", paymentStatus);
  const journal = new RecordingJournal();
  const events = new RecordingPublisher();
  const durable = new RecordingDurable();
  const handler = new RecordOrderRefundHandler(
    refunds,
    new DirectUnitOfWork(),
    journal,
    new FixedIdGenerator("ref"),
    new FixedClock(new Date(STRIPE_AT.getTime() + 5_000)),
    events,
    durable,
  );
  const send = (r: RefundReport) => handler.execute(new RecordOrderRefundCommand("pi_1", r));
  return { refunds, journal, events, durable, send };
}

describe("RecordOrderRefundHandler", () => {
  it("un partiel puis le reste : noté, cumulé, puis la commande est remboursée", async () => {
    const { refunds, journal, send } = build();

    await send(report(500, "re_1"));
    expect(refunds.status()).toBe("paid");
    await send(report(1_500, "re_2"));

    expect(refunds.status()).toBe("refunded");
    expect(journal.types()).toEqual([
      "order.refund_recorded",
      "order.refund_recorded",
      "order.fully_refunded",
    ]);
    expect(journal.facts[1]).toMatchObject({
      subjectType: "order",
      subjectId: "ord_1",
      payload: { subjectLabel: "CMD-1", amountCents: 1_500, refundedCents: 2_000 },
    });
  });

  it("un webhook rejoué ne sauve ni ne journalise rien", async () => {
    const { refunds, journal, send } = build();

    await send(report(500));
    await send(report(500));

    expect(refunds.saves).toBe(1);
    expect(journal.types()).toEqual(["order.refund_recorded"]);
  });

  it("une devise refusée : rien n'est sauvé, le refus est journalisé et publié", async () => {
    const { refunds, journal, events, send } = build();

    await send(report(500, "re_9", "usd"));

    expect(refunds.saves).toBe(0);
    expect(journal.facts).toEqual([
      {
        type: "order.refund_rejected",
        subjectType: "order",
        subjectId: "ord_1",
        payload: {
          subjectLabel: "CMD-1",
          amountCents: 500,
          currency: "usd",
          status: "succeeded",
          reason: "currency",
        },
      },
    ]);
    expect(events.published).toEqual([
      new OrderRefundRejectedEvent("ord_1", "CMD-1", "re_9", 500, "currency"),
    ]);
  });

  it("au-delà du total encaissé : refusé, la commande reste payée", async () => {
    const { refunds, events, send } = build();

    await send(report(1_500, "re_1"));
    await send(report(600, "re_2"));

    expect(refunds.status()).toBe("paid");
    expect(events.published).toEqual([
      new OrderRefundRejectedEvent("ord_1", "CMD-1", "re_2", 600, "exceeds_charge"),
    ]);
  });

  it("aucune commande ne porte l'intention : rien n'est écrit, le fait part aux paiements", async () => {
    const { journal, events, send } = build(null);
    const unmatched = report(500);

    await send(unmatched);

    expect(journal.facts).toEqual([]);
    expect(events.published).toEqual([new RefundWithoutOrderEvent(unmatched)]);
  });

  it("une panne du journal annule le constat : elle remonte, rien n'est publié", async () => {
    const refunds = new InMemoryRefunds("pi_1", "paid");
    const events = new RecordingPublisher();
    const handler = new RecordOrderRefundHandler(
      refunds,
      new DirectUnitOfWork(),
      new RecordingJournal(new Error("journal indisponible")),
      new FixedIdGenerator("ref"),
      new FixedClock(STRIPE_AT),
      events,
      new RecordingDurable(),
    );

    await expect(
      handler.execute(new RecordOrderRefundCommand("pi_1", report(500))),
    ).rejects.toThrow("journal indisponible");
    expect(events.published).toEqual([]);
  });
});

/** Lot E5b : l'avoir naît du fait durable d'un remboursement réussi, une fois. */
describe("RecordOrderRefundHandler — le fait durable d'un remboursement réussi", () => {
  it("écrit `order.refund_succeeded` pour le remboursement noté réussi, pas au rejeu", async () => {
    const { durable, send } = build();

    await send(report(500, "re_1"));
    await send(report(500, "re_1"));

    expect(durable.facts).toEqual([
      {
        type: "order.refund_succeeded",
        key: "order.refund_succeeded:ref_000001",
        payload: { orderId: "ord_1", refundId: "ref_000001" },
      },
    ]);
  });

  it("n'écrit rien pour un remboursement en attente", async () => {
    const { durable, send } = build();

    await send({ ...report(500, "re_1"), status: "pending" });

    expect(durable.facts).toEqual([]);
  });
});
