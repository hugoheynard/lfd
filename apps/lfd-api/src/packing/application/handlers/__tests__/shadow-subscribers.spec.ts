import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  HandedToPackingEvent,
  PackingListDrawnEvent,
  PackingListDrawnPayloadError,
  ReturnRequestedEvent,
} from "../../../../production/channels/packing/index.js";
import { ReturnDecisionNotYetServedError } from "../../../domain/errors/packing-shadow-errors.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { OnHandedToPacking } from "../on-handed-to-packing.handler.js";
import { OnPackingListDrawn } from "../on-packing-list-drawn.handler.js";
import { OnReturnRequested } from "../on-return-requested.handler.js";

/**
 * Les trois abonnés de l'ombre (plan `colisage/plan-domaine-colisage.md`, K1),
 * sur l'ombre en mémoire. Instants recopiés, jamais comparés à l'horloge.
 */
const AT = new Date("2026-09-13T05:10:00.000Z");
const NOW = new Date("2026-09-13T05:11:00.000Z");
const DAY = "2026-09-13";

function delivery(fact: { type: string; payload: Readonly<Record<string, unknown>> }) {
  return { eventId: "evt", type: fact.type, payload: fact.payload };
}

function drawn(orderId = "ord_1") {
  return new PackingListDrawnEvent(DAY, AT, {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    dueAt: "07:00",
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 2 },
      { sku: "CRO", productName: "Croissant", quantity: 1 },
    ],
  }).durableFact();
}

function setup() {
  const shadow = new InMemoryShadow();
  const clock = new FixedClock(NOW);
  return {
    shadow,
    list: new OnPackingListDrawn(shadow),
    handed: new OnHandedToPacking(shadow, clock),
    returned: new OnReturnRequested(shadow, clock),
  };
}

describe("OnPackingListDrawn", () => {
  it("inscrit la commande, une ligne par article, avec son échéance", async () => {
    const { shadow, list } = setup();

    await list.handle(delivery(drawn()));

    expect([...shadow.orders.values()]).toEqual([
      {
        serviceDay: DAY,
        orderId: "ord_1",
        reference: "CMD-ord_1",
        customerLabel: "Trois Ponts",
        fulfillmentMethod: "pickup",
        dueAt: "07:00",
        drawnAt: AT,
        lines: [{ sku: "CRO", productName: "Croissant", quantity: 3 }],
      },
    ]);
  });

  it("refuse une charge hors contrat, sans rien inscrire", async () => {
    const { shadow, list } = setup();

    await expect(list.handle(delivery({ type: "x", payload: {} }))).rejects.toThrow(
      PackingListDrawnPayloadError,
    );
    expect(shadow.orders.size).toBe(0);
  });
});

describe("OnHandedToPacking", () => {
  it("la réserve gagne la remise, reçue à l'horloge du colisage", async () => {
    const { shadow, handed } = setup();

    await handed.handle(delivery(new HandedToPackingEvent("b1", DAY, "CRO", 12, AT).durableFact()));

    expect(shadow.stockOf(DAY, "CRO")).toEqual({ received: 12, returned: 0 });
    expect(shadow.receipts.get("b1")?.receivedAt).toEqual(NOW);
  });

  it("une remise reçue deux fois ne compte qu'une fois", async () => {
    const { shadow, handed } = setup();
    const fact = new HandedToPackingEvent("b1", DAY, "CRO", 12, AT).durableFact();

    await handed.handle(delivery(fact));
    await handed.handle(delivery(fact));

    expect(shadow.stockOf(DAY, "CRO")?.received).toBe(12);
  });

  it("une remise AVANT la liste à coliser est gardée — l'ordre n'importe pas", async () => {
    const { shadow, list, handed } = setup();

    await handed.handle(delivery(new HandedToPackingEvent("b1", DAY, "CRO", 3, AT).durableFact()));
    await list.handle(delivery(drawn()));

    expect(shadow.stockOf(DAY, "CRO")?.received).toBe(3);
    expect(shadow.orders.size).toBe(1);
  });
});

describe("OnReturnRequested", () => {
  it("un retour `legacy` est appliqué, une fois, sans réponse", async () => {
    const { shadow, handed, returned } = setup();
    await handed.handle(delivery(new HandedToPackingEvent("b1", DAY, "CRO", 12, AT).durableFact()));
    const fact = new ReturnRequestedEvent("return-b1", DAY, "CRO", 12, true, AT).durableFact();

    await returned.handle(delivery(fact));
    await returned.handle(delivery(fact));

    expect(shadow.stockOf(DAY, "CRO")).toEqual({ received: 12, returned: 12 });
  });

  it("un retour arrivé AVANT sa remise est gardé : les deux finissent par s'annuler", async () => {
    const { shadow, handed, returned } = setup();

    await returned.handle(
      delivery(new ReturnRequestedEvent("return-b1", DAY, "CRO", 5, true, AT).durableFact()),
    );
    await handed.handle(delivery(new HandedToPackingEvent("b1", DAY, "CRO", 5, AT).durableFact()));

    expect(shadow.stockOf(DAY, "CRO")).toEqual({ received: 5, returned: 5 });
  });

  it("🔴 une DEMANDE (journée `packing`) n'est ni tranchée ni perdue : elle échoue", async () => {
    const { shadow, returned } = setup();
    const fact = new ReturnRequestedEvent("return-b1", DAY, "CRO", 5, false, AT).durableFact();

    await expect(returned.handle(delivery(fact))).rejects.toThrow(ReturnDecisionNotYetServedError);
    expect(shadow.receipts.size).toBe(0);
  });
});
