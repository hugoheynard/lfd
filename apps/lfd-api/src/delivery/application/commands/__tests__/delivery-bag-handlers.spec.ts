import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  BagCodeExhaustedError,
  BagLoadedError,
  BagsNotDeclarableError,
  DeliveryBagNotFoundError,
  DeliveryRoundDepartedError,
} from "../../../domain/errors/delivery-loading-errors.js";
import { DeclareDeliveryBagsCommand } from "../declare-delivery-bags.command.js";
import { DeclareDeliveryBagsHandler } from "../declare-delivery-bags.handler.js";
import { VoidDeliveryBagCommand } from "../void-delivery-bag.command.js";
import { VoidDeliveryBagHandler } from "../void-delivery-bag.handler.js";
import {
  bagOf,
  InMemoryBags,
  InMemoryStopLoadings,
  ScriptedDrawer,
  stopOf,
} from "./loading-doubles.js";
import { deliveryOn, FixedDeliveryOrders } from "./round-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);
const ORDERS = new FixedDeliveryOrders([
  deliveryOn("o_1", DAY),
  deliveryOn("o_cancel", DAY, { status: "cancelled" }),
  deliveryOn("o_pickup", DAY, { delivery: false }),
]);

function tools() {
  return {
    clock: new FixedClock(NOW),
    events: new RecordingPublisher(),
    uow: new DirectUnitOfWork(),
  };
}

describe("DeclareDeliveryBagsHandler — L4-C16, L4-C20", () => {
  function declare(options: {
    readonly bags?: InMemoryBags;
    readonly loadings?: InMemoryStopLoadings;
    readonly codes?: readonly string[];
  }) {
    const { clock, events, uow } = tools();
    const bags = options.bags ?? new InMemoryBags();
    const handler = new DeclareDeliveryBagsHandler(
      bags,
      options.loadings ?? new InMemoryStopLoadings(),
      ORDERS,
      new ScriptedDrawer(options.codes ?? ["AAAAAA", "BBBBBB", "CCCCCC"]),
      new FixedIdGenerator("bag"),
      clock,
      events,
      uow,
    );
    return { handler, bags, events };
  }

  it("crée n sacs, chacun son code, et UN fait qui les nomme", async () => {
    const { handler, bags, events } = declare({});

    const ids = await handler.execute(new DeclareDeliveryBagsCommand({ orderId: "o_1", count: 2 }));

    expect(ids).toEqual(["bag_000001", "bag_000002"]);
    expect([...bags.byId.values()].map((bag) => bag.code)).toEqual(["AAAAAA", "BBBBBB"]);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "delivery_bag.declared",
        subjectType: "order",
        subjectId: "o_1",
        payload: {
          subjectLabel: "CMD-o_1",
          bags: [
            { id: "bag_000001", name: "AAAAAA" },
            { id: "bag_000002", name: "BBBBBB" },
          ],
        },
      },
    ]);
  });

  it("retire un code déjà porté par un sac, annulé compris", async () => {
    const { handler, bags } = declare({
      bags: new InMemoryBags(bagOf("b_old", "o_x", "AAAAAA")),
      codes: ["AAAAAA", "CCCCCC"],
    });

    await handler.execute(new DeclareDeliveryBagsCommand({ orderId: "o_1", count: 1 }));

    expect(bags.byId.get("bag_000001")?.code).toBe("CCCCCC");
  });

  it("une source d'aléa qui ne rend que des codes pris finit en refus, pas en boucle", async () => {
    const { handler } = declare({
      bags: new InMemoryBags(bagOf("b_old", "o_x", "AAAAAA")),
      codes: ["AAAAAA"],
    });

    await expect(
      handler.execute(new DeclareDeliveryBagsCommand({ orderId: "o_1", count: 1 })),
    ).rejects.toThrow(BagCodeExhaustedError);
  });

  it.each([
    ["inconnue", "o_x"],
    ["annulée", "o_cancel"],
    ["en retrait", "o_pickup"],
  ])("refuse une commande %s, sans rien écrire", async (_label, orderId) => {
    const { handler, bags, events } = declare({});

    await expect(
      handler.execute(new DeclareDeliveryBagsCommand({ orderId, count: 1 })),
    ).rejects.toThrow(BagsNotDeclarableError);
    expect(bags.byId.size).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("refuse un sac de plus pour une commande dont la tournée est partie", async () => {
    const { handler } = declare({
      loadings: new InMemoryStopLoadings(stopOf("o_1", { departedAt: NOW })),
    });

    await expect(
      handler.execute(new DeclareDeliveryBagsCommand({ orderId: "o_1", count: 1 })),
    ).rejects.toThrow(DeliveryRoundDepartedError);
  });
});

describe("VoidDeliveryBagHandler — L4-C19", () => {
  function voiding(
    loadings: InMemoryStopLoadings,
    bags = new InMemoryBags(bagOf("b_1", "o_1", "AAAAAA")),
  ) {
    const { clock, events, uow } = tools();
    return {
      handler: new VoidDeliveryBagHandler(bags, loadings, ORDERS, clock, events, uow),
      bags,
      events,
    };
  }

  it("annule, et trace le sac et sa commande", async () => {
    const { handler, bags, events } = voiding(new InMemoryStopLoadings(stopOf("o_1")));

    await handler.execute(new VoidDeliveryBagCommand("b_1"));

    expect(bags.byId.get("b_1")?.voidedAt).toEqual(NOW);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "delivery_bag.voided",
      subjectType: "delivery_bag",
      subjectId: "b_1",
      payload: { subjectLabel: "AAAAAA", order: { id: "o_1", name: "CMD-o_1" } },
    });
  });

  it("refuse un sac chargé", async () => {
    const loaded = stopOf("o_1", {
      loads: [
        {
          id: "l_1",
          bagId: "b_1",
          loadedAt: NOW,
          loadedBy: "staff_1",
          loadedVia: "scan",
          createdAt: NOW,
        },
      ],
    });
    const { handler, bags } = voiding(new InMemoryStopLoadings(loaded));

    await expect(handler.execute(new VoidDeliveryBagCommand("b_1"))).rejects.toThrow(
      BagLoadedError,
    );
    expect(bags.byId.get("b_1")?.voidedAt).toBeNull();
  });

  it("un sac inconnu répond 404", async () => {
    const { handler } = voiding(new InMemoryStopLoadings());

    await expect(handler.execute(new VoidDeliveryBagCommand("b_x"))).rejects.toThrow(
      DeliveryBagNotFoundError,
    );
  });

  it("annuler un sac déjà annulé n'écrit rien", async () => {
    const { handler, events } = voiding(new InMemoryStopLoadings());
    await handler.execute(new VoidDeliveryBagCommand("b_1"));

    await handler.execute(new VoidDeliveryBagCommand("b_1"));

    expect(events.traced).toHaveLength(1);
  });
});
