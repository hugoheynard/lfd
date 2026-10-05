import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  HandedToPackingEvent,
  PackingListDrawnEvent,
  PackingListDrawnPayloadError,
  ReturnRequestedEvent,
} from "../../../../production/channels/packing/index.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import {
  InMemoryReturnReader,
  InMemoryReturns,
  InMemoryStocks,
  RecordingDurable,
} from "../../__tests__/station-doubles.js";
import { PackingReturnDesk } from "../../returns/packing-return-desk.service.js";
import { OnHandedToPacking } from "../on-handed-to-packing.handler.js";
import { OnPackingListDrawn } from "../on-packing-list-drawn.handler.js";
import { OnReturnRequested } from "../on-return-requested.handler.js";

/**
 * Les trois abonnés de l'ombre (plan `colisage/colisage.md`, K1),
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
  const returns = new InMemoryReturns();
  const stocks = new InMemoryStocks(shadow);
  const durable = new RecordingDurable();
  const desk = new PackingReturnDesk(
    returns,
    new InMemoryReturnReader(returns, shadow),
    stocks,
    durable,
    clock,
  );
  return {
    shadow,
    returns,
    stocks,
    durable,
    list: new OnPackingListDrawn(shadow),
    handed: new OnHandedToPacking(shadow, clock, desk),
    returned: new OnReturnRequested(shadow, clock, desk),
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
        // K2b : toute commande inscrite désormais liste ses contenants.
        containerMode: "listed",
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
});

/** Une demande de retour d'une journée `packing` (K2) : elle porte sa remise. */
function ask(requestId: string, quantity: number, handoffId = "b1") {
  return new ReturnRequestedEvent(
    requestId,
    DAY,
    "CRO",
    quantity,
    false,
    AT,
    handoffId,
  ).durableFact();
}

describe("OnReturnRequested — une DEMANDE (journée `packing`, K2)", () => {
  const RETURNED = "packing.returned";

  it("rend ce qui n'est pas au bac, et répond par `packing.returned`", async () => {
    const { handed, returned, durable, shadow, stocks } = setup();
    await handed.handle(delivery(new HandedToPackingEvent("b1", DAY, "CRO", 12, AT).durableFact()));
    const held = await stocks.lock(DAY, "CRO");
    held.take(5, "Croissant");
    await stocks.save(held);

    await returned.handle(delivery(ask("return-x", 12)));

    expect(durable.of(RETURNED)).toEqual([
      {
        type: RETURNED,
        key: `${RETURNED}:return-x`,
        payload: {
          requestId: "return-x",
          serviceDay: DAY,
          returned: 7,
          decidedAt: NOW.toISOString(),
        },
      },
    ]);
    expect(shadow.stockOf(DAY, "CRO")).toEqual({ received: 12, returned: 7 });
  });

  it("répond ZÉRO quand tout est au bac — un refus, affiché au fournil (Q5)", async () => {
    const { handed, returned, durable, stocks } = setup();
    await handed.handle(delivery(new HandedToPackingEvent("b1", DAY, "CRO", 12, AT).durableFact()));
    const held = await stocks.lock(DAY, "CRO");
    held.take(12, "Croissant");
    await stocks.save(held);

    await returned.handle(delivery(ask("return-x", 12)));

    expect(durable.of(RETURNED)[0]?.payload).toMatchObject({ returned: 0 });
  });

  it("« remise inconnue » : la demande ATTEND, et se tranche à l'arrivée de la remise", async () => {
    const { handed, returned, durable } = setup();

    await returned.handle(delivery(ask("return-x", 12)));
    expect(durable.facts).toEqual([]);

    await handed.handle(delivery(new HandedToPackingEvent("b1", DAY, "CRO", 12, AT).durableFact()));
    expect(durable.of(RETURNED)[0]?.payload).toMatchObject({ requestId: "return-x", returned: 12 });
  });

  it("une demande livrée deux fois n'est tranchée qu'une fois", async () => {
    const { handed, returned, durable, shadow } = setup();
    await handed.handle(delivery(new HandedToPackingEvent("b1", DAY, "CRO", 12, AT).durableFact()));

    await returned.handle(delivery(ask("return-x", 5)));
    await returned.handle(delivery(ask("return-x", 5)));

    expect(durable.of(RETURNED)).toHaveLength(1);
    expect(shadow.stockOf(DAY, "CRO")).toEqual({ received: 12, returned: 5 });
  });

  it("une demande sans sa remise est hors contrat : elle échoue, visible", async () => {
    const { returned } = setup();
    const fact = new ReturnRequestedEvent("return-x", DAY, "CRO", 5, false, AT).durableFact();

    await expect(returned.handle(delivery(fact))).rejects.toThrow(/illisible/);
  });
});
