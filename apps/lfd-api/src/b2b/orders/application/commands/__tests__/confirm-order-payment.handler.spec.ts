import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { OrderPaymentFailedEvent } from "../../../domain/events/order-payment-failed.event.js";
import { CancelledOrderPaymentReader } from "../../../domain/ports/cancelled-order-payment.reader.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import { ConfirmOrderPaymentCommand } from "../confirm-order-payment.command.js";
import { ConfirmOrderPaymentHandler } from "../confirm-order-payment.handler.js";
import { RecordingDurable } from "./durable-doubles.js";

/** Ce que les doublés ont vu passer : les marquages, et les faits durables écrits. */
interface Sink {
  paid: string[];
  failed: string[];
  readonly durable: RecordingDurable;
}

const emptySink = (): Sink => ({ paid: [], failed: [], durable: new RecordingDurable() });

/** Les faits du refus et du remboursement dû — `order.paid` est éprouvé à part. */
const settlementFacts = (sink: Sink) =>
  sink.durable.facts.filter((fact) => fact.type !== "order.paid");

/**
 * Repo doublé : enregistre lequel des deux marquages a été appelé, avec quel
 * intent, et rend l'identifiant de commande que le vrai dépôt rendrait.
 *
 * `franchit` porte tout l'enjeu : `null` simule ce que la base répond quand plus
 * rien n'était en vol — webhook rejoué, ou intention inconnue.
 */
function recordingRepo(sink: Sink, franchit: string | null): OrderRepository {
  return {
    place: () => Promise.reject(new Error("non utilisé")),
    markPaid: (id) => {
      sink.paid.push(id);
      return Promise.resolve(franchit);
    },
    markPaymentFailed: (id) => {
      sink.failed.push(id);
      return Promise.resolve(franchit);
    },
    markFulfilled: () => Promise.reject(new Error("non utilisé")),
    markReady: () => Promise.reject(new Error("non utilisé")),
    absorbIntoPlan: () => Promise.reject(new Error("non utilisé")),
    markAbandoned: () => Promise.reject(new Error("non utilisé")),
    failAtClosing: () => Promise.reject(new Error("non utilisé")),
  };
}

/** La commande annulée qui porte l'intention, ou aucune ; et les intentions demandées. */
class CancelledOrders extends CancelledOrderPaymentReader {
  readonly asked: string[] = [];

  constructor(private readonly cancelledOrderId: string | null) {
    super();
  }

  cancelledOrderOf(paymentIntentId: string): Promise<string | null> {
    this.asked.push(paymentIntentId);
    return Promise.resolve(this.cancelledOrderId);
  }
}

const handlerWith = (
  sink: Sink,
  franchit: string | null,
  cancelled: CancelledOrders = new CancelledOrders(null),
): ConfirmOrderPaymentHandler =>
  new ConfirmOrderPaymentHandler(
    recordingRepo(sink, franchit),
    cancelled,
    new DirectUnitOfWork(),
    sink.durable,
  );

describe("ConfirmOrderPaymentHandler", () => {
  it("route un succès vers markPaid(paymentIntentId)", async () => {
    const sink = emptySink();

    await handlerWith(sink, "order_1").execute(new ConfirmOrderPaymentCommand("pi_1", "succeeded"));

    expect(sink.paid).toEqual(["pi_1"]);
    expect(sink.failed).toEqual([]);
  });

  it("route un échec vers markPaymentFailed(paymentIntentId)", async () => {
    const sink = emptySink();

    await handlerWith(sink, "order_2").execute(new ConfirmOrderPaymentCommand("pi_2", "failed"));

    expect(sink.failed).toEqual(["pi_2"]);
    expect(sink.paid).toEqual([]);
  });
});

/**
 * 🔴 **Les faits publiés** (2026-09-17). Le handler écrivait une colonne que
 * personne ne relisait : ni l'encaissement ni le refus n'étaient dits au client.
 * Ces quatre cas tiennent ce qui manquait, et surtout la condition qui interdit
 * d'écrire deux fois à la même personne.
 */
describe("ConfirmOrderPaymentHandler — ce qu'il PUBLIE", () => {
  /**
   * Lot E4 (2026-10-10) : le règlement acquis n'existe plus qu'en
   * `order.paid`, durable (testé plus bas) — aucun autre fait ne l'accompagne.
   */
  it("n'écrit aucun fait de refus ni de remboursement sur un règlement acquis", async () => {
    const sink = emptySink();

    await handlerWith(sink, "order_7").execute(new ConfirmOrderPaymentCommand("pi_7", "succeeded"));

    expect(settlementFacts(sink)).toEqual([]);
  });

  /**
   * Lot E4b (2026-10-10) : le refus partait en mémoire après `markPaymentFailed`
   * — un redémarrage entre l'accusé du webhook et le saut perdait le courriel
   * de refus et la cloche. Il s'écrit désormais durable, dans l'unité de
   * travail de la bascule, et plus rien ne part en mémoire (le handler n'a
   * même plus de bus à qui parler).
   */
  it("refus : le fait durable est écrit avec l'identifiant de la COMMANDE, rien en mémoire", async () => {
    const sink = emptySink();

    await handlerWith(sink, "order_8").execute(new ConfirmOrderPaymentCommand("pi_8", "failed"));

    expect(sink.durable.facts).toEqual([
      new OrderPaymentFailedEvent("order_8", "refused").durableFact(),
    ]);
    expect(sink.durable.facts[0]?.key).toBe("order.payment_failed:order_8:refused");
  });

  /**
   * 🔴 **Le cas qui interdit deux courriels pour un seul paiement.** Stripe
   * réémet jusqu'à obtenir un 2xx : au second passage, plus rien n'est en vol,
   * le dépôt rend `null`, et il ne doit alors RIEN se passer. L'idempotence du
   * message est celle de l'écriture — pas un garde ajouté par-dessus.
   */
  it("🔴 ne publie RIEN quand aucune ligne n'a franchi — webhook rejoué", async () => {
    const sink = emptySink();

    await handlerWith(sink, null).execute(new ConfirmOrderPaymentCommand("pi_9", "succeeded"));

    // Le marquage est bien tenté : c'est la BASE qui arbitre, pas le handler.
    expect(sink.paid).toEqual(["pi_9"]);
    expect(settlementFacts(sink)).toEqual([]);
  });

  it("🔴 ne publie rien non plus sur un refus déjà enregistré", async () => {
    const sink = emptySink();

    await handlerWith(sink, null).execute(new ConfirmOrderPaymentCommand("pi_10", "failed"));

    expect(sink.failed).toEqual(["pi_10"]);
    expect(settlementFacts(sink)).toEqual([]);
  });
});

/**
 * Lot 6 bis du plan d'abandon : la clôture annule une commande même quand
 * Stripe n'a pas confirmé la mort de son intention. Un encaissement tardif ne
 * la rouvre pas — mais l'argent est reçu, et quelqu'un doit rembourser.
 */
describe("ConfirmOrderPaymentHandler — un encaissement sur une commande annulée", () => {
  it("publie « à rembourser » quand rien ne franchit ET que la commande est annulée", async () => {
    const sink = emptySink();
    const cancelled = new CancelledOrders("order_11");

    await handlerWith(sink, null, cancelled).execute(
      new ConfirmOrderPaymentCommand("pi_11", "succeeded"),
    );

    expect(cancelled.asked).toEqual(["pi_11"]);
    expect(sink.durable.facts).toEqual([
      {
        type: "order.paid_after_cancellation",
        key: "order.paid_after_cancellation:order_11",
        payload: { orderId: "order_11" },
      },
    ]);
  });

  it("ne demande rien quand l'encaissement a franchi", async () => {
    const sink = emptySink();
    const cancelled = new CancelledOrders("order_12");

    await handlerWith(sink, "order_12", cancelled).execute(
      new ConfirmOrderPaymentCommand("pi_12", "succeeded"),
    );

    expect(cancelled.asked).toEqual([]);
    expect(settlementFacts(sink)).toEqual([]);
  });

  it("ne sonne pas sur un refus arrivé après l'annulation — aucun argent reçu", async () => {
    const sink = emptySink();
    const cancelled = new CancelledOrders("order_13");

    await handlerWith(sink, null, cancelled).execute(
      new ConfirmOrderPaymentCommand("pi_13", "failed"),
    );

    expect(cancelled.asked).toEqual([]);
    expect(settlementFacts(sink)).toEqual([]);
  });
});

/**
 * Lot E5a : la facture carte d'une commande déjà retirée ne naît que de
 * l'encaissement — il doit survivre à un redémarrage, donc partir DURABLE,
 * et une seule fois.
 */
describe("ConfirmOrderPaymentHandler — le fait durable de l'encaissement", () => {
  it("écrit `order.paid` au franchissement, avec la commande", async () => {
    const sink = emptySink();
    await handlerWith(sink, "ord_1").execute(new ConfirmOrderPaymentCommand("pi_1", "succeeded"));
    expect(sink.durable.facts).toEqual([
      { type: "order.paid", key: "order.paid:ord_1", payload: { orderId: "ord_1" } },
    ]);
  });

  it("n'écrit rien quand rien n'a franchi (webhook rejoué)", async () => {
    const sink = emptySink();
    await handlerWith(sink, null).execute(new ConfirmOrderPaymentCommand("pi_1", "succeeded"));
    expect(sink.durable.facts).toEqual([]);
  });

  it("n'écrit pas `order.paid` sur un refus de carte", async () => {
    const sink = emptySink();
    await handlerWith(sink, "ord_1").execute(new ConfirmOrderPaymentCommand("pi_1", "failed"));
    expect(sink.durable.facts.map((fact) => fact.type)).toEqual(["order.payment_failed"]);
  });
});
