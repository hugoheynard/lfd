import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderCardSubjectWithoutIntentError } from "../../../domain/errors/order-payment-errors.js";
import { OrderPaidAfterCancellationEvent } from "../../../domain/events/order-paid-after-cancellation.event.js";
import { OrderPaidFact } from "../../../domain/events/order-paid.fact.js";
import { OrderPaymentFailedEvent } from "../../../domain/events/order-payment-failed.event.js";
import { CancelledOrderPaymentReader } from "../../../domain/ports/cancelled-order-payment.reader.js";
import type { OrderCardStanding } from "../../../domain/ports/order-card-standing.reader.js";
import { RecordingDurable } from "../../commands/__tests__/durable-doubles.js";
import { OrderSubjectSettlement } from "../order-subject-settlement.js";
import {
  FixedStandings,
  RecordingLock,
  settlingRepo,
  standing,
  Steps,
} from "./order-card-doubles.js";

/** La commande annulée NON payée qui porte l'intention (C3.4), ou aucune. */
class CancelledOrders extends CancelledOrderPaymentReader {
  constructor(private readonly refundDue: string | null) {
    super();
  }

  cancelledOrderOf(): Promise<string | null> {
    return Promise.resolve(this.refundDue);
  }
}

const ORDER = { type: "order", id: "ord_1" } as const;

function build(
  options: {
    readonly row?: OrderCardStanding | null;
    readonly crossed?: string | null;
    readonly refundDue?: string | null;
  } = {},
) {
  const steps = new Steps();
  const durable = new RecordingDurable();
  const row = options.row === undefined ? standing() : options.row;
  const standings = new FixedStandings(row === null ? [] : [row]);
  const settlement = new OrderSubjectSettlement(
    new RecordingLock(steps),
    standings,
    settlingRepo(steps, options.crossed === undefined ? "ord_1" : options.crossed),
    new CancelledOrders(options.refundDue ?? null),
    durable,
  );
  return { steps, durable, standings, settlement };
}

/**
 * **La commande, sujet du bloc `card-payment`** (plan M2, §3.3, §3.6, §4.4) —
 * ce que faisait `ConfirmOrderPaymentHandler`, retiré au lot P0.c2, appelé
 * désormais par le webhook des cartes dans SA transaction.
 */
describe("OrderSubjectSettlement — un encaissement", () => {
  it("applied : verrou de la commande d'abord, `markPaid` par l'intention, `order.paid` au franchissement", async () => {
    const { steps, durable, settlement } = build();

    await expect(settlement.onPaid(ORDER)).resolves.toBe("applied");

    expect(steps.seen).toEqual(["lock:ord_1", "markPaid:pi_1"]);
    expect(durable.facts).toEqual([new OrderPaidFact("ord_1").durableFact()]);
  });

  it("🔴 already_applied : rien n'a franchi (déjà payée, webhook rejoué) — RIEN n'est publié", async () => {
    const { durable, settlement } = build({ crossed: null, row: standing({ settled: "paid" }) });

    await expect(settlement.onPaid(ORDER)).resolves.toBe("already_applied");

    expect(durable.facts).toEqual([]);
  });

  it("refused : annulée et non payée — la cloche « à rembourser » part, une fois, avec la commande", async () => {
    const { durable, settlement } = build({
      crossed: null,
      refundDue: "ord_1",
      row: standing({ cancelled: true, settled: "failed" }),
    });

    await expect(settlement.onPaid(ORDER)).resolves.toBe("refused");

    expect(durable.facts).toEqual([new OrderPaidAfterCancellationEvent("ord_1").durableFact()]);
  });

  /**
   * Régression gardée de C4.11 bis (`vitruve` BLOQUANT 2) : une annulée déjà
   * payée puis remboursée qui voit un encaissement relivré ne doit pas passer
   * pour « encaissée après annulation » — elle serait remboursée deux fois.
   */
  it("refused sans cloche : annulée APRÈS l'encaissement — le lecteur ne la dit pas à rembourser", async () => {
    const { durable, settlement } = build({
      crossed: null,
      refundDue: null,
      row: standing({ cancelled: true, settled: "paid" }),
    });

    await expect(settlement.onPaid(ORDER)).resolves.toBe("refused");

    expect(durable.facts).toEqual([]);
  });

  it("refuse une commande sans intention : incohérence de base, nommée", async () => {
    const { steps, settlement } = build({ row: standing({ providerRef: null }) });

    await expect(settlement.onPaid(ORDER)).rejects.toBeInstanceOf(
      OrderCardSubjectWithoutIntentError,
    );
    expect(steps.seen).toEqual(["lock:ord_1"]);
  });

  it("refuse une commande inconnue", async () => {
    const { settlement } = build({ row: null });

    await expect(settlement.onPaid(ORDER)).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});

describe("OrderSubjectSettlement — un refus de la banque", () => {
  it("`markPaymentFailed` sous le verrou, et le fait durable du refus avec la COMMANDE", async () => {
    const { steps, durable, settlement } = build();

    await settlement.onPaymentFailed(ORDER);

    expect(steps.seen).toEqual(["lock:ord_1", "markPaymentFailed:pi_1"]);
    expect(durable.facts).toEqual([new OrderPaymentFailedEvent("ord_1", "refused").durableFact()]);
  });

  it("🔴 un refus rejoué ne franchit rien et ne publie rien — pas deux courriels", async () => {
    const { durable, settlement } = build({ crossed: null });

    await settlement.onPaymentFailed(ORDER);

    expect(durable.facts).toEqual([]);
  });
});

describe("OrderSubjectSettlement — ce que le bloc demande", () => {
  it("isCancelled se lit sous le verrou de la commande", async () => {
    const { steps, settlement } = build({ row: standing({ cancelled: true }) });

    await expect(settlement.isCancelled(ORDER)).resolves.toBe(true);
    expect(steps.seen).toEqual(["lock:ord_1"]);
  });

  it("describe : le numéro et l'écran de la commande au back-office", async () => {
    const { settlement } = build();

    await expect(settlement.describe(ORDER)).resolves.toEqual({
      label: "Commande ORD-0001",
      link: "/commandes/ord_1",
    });
  });

  it("claim : revendique son intention, au total, en premier paiement, au règlement qu'elle voit", async () => {
    const { settlement } = build({ row: standing({ settled: "failed" }) });

    await expect(settlement.claim("lfc-stripe", "pi_1")).resolves.toEqual({
      subject: ORDER,
      amountCents: 2_340,
      role: "first",
      settled: "failed",
    });
  });

  it("claim : une intention qu'aucune commande ne porte n'est pas à elle", async () => {
    const { settlement } = build();

    await expect(settlement.claim("lfc-stripe", "pi_lien")).resolves.toBeNull();
  });

  it("referencesSince : les commandes à intention depuis la borne, sous la même forme", async () => {
    const { settlement, standings } = build({ row: standing({ settled: "paid" }) });
    const since = new Date(Date.UTC(2030, 0, 1));

    await expect(settlement.referencesSince(since)).resolves.toEqual([
      { subject: ORDER, amountCents: 2_340, role: "first", settled: "paid", providerRef: "pi_1" },
    ]);
    expect(standings.sinceAsked).toEqual([since]);
  });
});
