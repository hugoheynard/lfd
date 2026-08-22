import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  HandoverRefusedError,
  HandoverTokenNotFoundError,
} from "../../../domain/errors/order-errors.js";
import { OrderReader, type HandoverOrder } from "../../../domain/ports/order.reader.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import { ConfirmHandoverCommand } from "../confirm-handover.command.js";
import { ConfirmHandoverHandler } from "../confirm-handover.handler.js";

const NOW = new Date("2026-08-12T09:14:00.000Z");

function handoverOrder(overrides: Partial<HandoverOrder> = {}): HandoverOrder {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-XYZ-4242",
    customerLabel: "Boulangerie Martin",
    placedAt: new Date("2026-08-11T16:02:00.000Z"),
    requestedDeliveryDate: new Date("2026-08-12T00:00:00.000Z"),
    pickupLabel: "Labo — Pantin",
    status: "placed",
    fulfillmentMethod: "pickup",
    handedOverAt: null,
    handedOverBy: null,
    lines: [
      { sku: "CRO-01", productName: "Croissant", quantity: 40 },
      { sku: "PAC-01", productName: "Pain au chocolat", quantity: 20 },
    ],
    ...overrides,
  };
}

/** Reader doublé : rend une commande fixe pour tout jeton, ou `null`. */
function readerOf(order: HandoverOrder | null): OrderReader {
  return {
    listForProduction: () => Promise.resolve([]),
    listByCompany: () => Promise.reject(new Error("non utilisé")),
    listPersonal: () => Promise.reject(new Error("non utilisé")),
    findById: () => Promise.reject(new Error("non utilisé")),
    listForAdmin: () => Promise.reject(new Error("non utilisé")),
    findByHandoverToken: () => Promise.resolve(order),
  };
}

/** Repo doublé : `won` décide qui gagne la course d'écriture. */
function repoOf(won: boolean, sink: { calls: [string, Date, string][] }): OrderRepository {
  return {
    place: () => Promise.reject(new Error("non utilisé")),
    markPaid: () => Promise.reject(new Error("non utilisé")),
    markPaymentFailed: () => Promise.reject(new Error("non utilisé")),
    markHandedOver: (token, at, by) => {
      sink.calls.push([token, at, by]);
      return Promise.resolve(won);
    },
  };
}

function sink(): { calls: [string, Date, string][] } {
  return { calls: [] };
}

describe("ConfirmHandoverHandler", () => {
  it("grave la remise et rend l'attestation obtenue", async () => {
    const writes = sink();
    const handler = new ConfirmHandoverHandler(
      readerOf(handoverOrder()),
      repoOf(true, writes),
      new FixedClock(NOW),
    );

    const view = await handler.execute(new ConfirmHandoverCommand("TOK1", "auth0|karim"));

    expect(writes.calls).toEqual([["TOK1", NOW, "auth0|karim"]]);
    expect(view.handedOverAt).toBe(NOW.toISOString());
    expect(view.handedOverBy).toBe("auth0|karim");
    // `blockedReason` répond « peut-on remettre cette commande MAINTENANT ? » —
    // et la réponse, juste après l'avoir remise, est non. Ce n'est pas un échec
    // déguisé : c'est ce qui désarme le bouton et empêche la double remise. Le
    // succès, lui, se lit sur `handedOverAt`, jamais sur l'absence de blocage.
    expect(view.blockedReason).toBe("Cette commande a déjà été remise.");
    expect(view.totalUnits).toBe(60);
  });

  it("refuse un jeton inconnu sans rien écrire", async () => {
    const writes = sink();
    const handler = new ConfirmHandoverHandler(
      readerOf(null),
      repoOf(true, writes),
      new FixedClock(NOW),
    );

    await expect(
      handler.execute(new ConfirmHandoverCommand("NOPE", "auth0|karim")),
    ).rejects.toThrow(HandoverTokenNotFoundError);
    expect(writes.calls).toEqual([]);
  });

  it("refuse une commande annulée AVANT d'écrire", async () => {
    // La garantie : la règle est évaluée sur l'état lu, et l'écriture n'est même
    // pas tentée. Un `markHandedOver` inconditionnel ferait passer `cancelled`
    // à `fulfilled` en silence.
    const writes = sink();
    const handler = new ConfirmHandoverHandler(
      readerOf(handoverOrder({ status: "cancelled" })),
      repoOf(true, writes),
      new FixedClock(NOW),
    );

    await expect(
      handler.execute(new ConfirmHandoverCommand("TOK1", "auth0|karim")),
    ).rejects.toThrow(HandoverRefusedError);
    expect(writes.calls).toEqual([]);
  });

  it("refuse une commande en livraison — le QR n'y ouvre pas de comptoir", async () => {
    const writes = sink();
    const handler = new ConfirmHandoverHandler(
      readerOf(handoverOrder({ fulfillmentMethod: "delivery" })),
      repoOf(true, writes),
      new FixedClock(NOW),
    );

    await expect(
      handler.execute(new ConfirmHandoverCommand("TOK1", "auth0|karim")),
    ).rejects.toThrow(HandoverRefusedError);
    expect(writes.calls).toEqual([]);
  });

  it("ne réécrit pas quand un autre poste a gagné la course", async () => {
    // L'état lu autorisait la remise, mais la base a refusé l'écriture : un
    // second scan a été plus rapide. On ne réécrit rien — l'attestation de
    // l'autre reste la seule vraie.
    const writes = sink();
    const handler = new ConfirmHandoverHandler(
      readerOf(handoverOrder()),
      repoOf(false, writes),
      new FixedClock(NOW),
    );

    await expect(handler.execute(new ConfirmHandoverCommand("TOK1", "auth0|lea"))).rejects.toThrow(
      HandoverRefusedError,
    );
    expect(writes.calls).toHaveLength(1);
  });
});
