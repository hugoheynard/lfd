import { DomainEventPublisher } from "../../../../../platform/events/domain-event-publisher.js";
import { OrderPaymentFailedEvent } from "../../../domain/events/order-payment-failed.event.js";
import { OrderPaymentSettledEvent } from "../../../domain/events/order-payment-settled.event.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import { ConfirmOrderPaymentCommand } from "../confirm-order-payment.command.js";
import { ConfirmOrderPaymentHandler } from "../confirm-order-payment.handler.js";

/** Ce que les doublés ont vu passer : les marquages, et les faits publiés. */
interface Sink {
  paid: string[];
  failed: string[];
  published: object[];
}

const emptySink = (): Sink => ({ paid: [], failed: [], published: [] });

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
  };
}

/** Le vrai port, branché sur un journal : c'est par lui que les faits sortent. */
function recordingPublisher(sink: Sink): DomainEventPublisher {
  return {
    publish: (event: object) => {
      sink.published.push(event);
    },
    publishTraced: () => Promise.reject(new Error("non utilisé")),
  };
}

const handlerWith = (sink: Sink, franchit: string | null): ConfirmOrderPaymentHandler =>
  new ConfirmOrderPaymentHandler(recordingRepo(sink, franchit), recordingPublisher(sink));

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
  it("publie le règlement acquis, avec l'identifiant de la COMMANDE", async () => {
    const sink = emptySink();

    await handlerWith(sink, "order_7").execute(new ConfirmOrderPaymentCommand("pi_7", "succeeded"));

    expect(sink.published).toEqual([new OrderPaymentSettledEvent("order_7")]);
  });

  it("publie le refus, avec l'identifiant de la COMMANDE", async () => {
    const sink = emptySink();

    await handlerWith(sink, "order_8").execute(new ConfirmOrderPaymentCommand("pi_8", "failed"));

    expect(sink.published).toEqual([new OrderPaymentFailedEvent("order_8")]);
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
    expect(sink.published).toEqual([]);
  });

  it("🔴 ne publie rien non plus sur un refus déjà enregistré", async () => {
    const sink = emptySink();

    await handlerWith(sink, null).execute(new ConfirmOrderPaymentCommand("pi_10", "failed"));

    expect(sink.failed).toEqual(["pi_10"]);
    expect(sink.published).toEqual([]);
  });
});
