import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  BagInOtherRoundError,
  BagOrderNotComposedError,
  DeliveryRoundNotReadyError,
} from "../../../domain/errors/delivery-loading-errors.js";
import { DepartDeliveryRoundCommand } from "../depart-delivery-round.command.js";
import { DepartDeliveryRoundHandler } from "../depart-delivery-round.handler.js";
import { LoadDeliveryBagCommand } from "../load-delivery-bag.command.js";
import { LoadDeliveryBagHandler } from "../load-delivery-bag.handler.js";
import { UnloadDeliveryBagCommand } from "../unload-delivery-bag.command.js";
import { UnloadDeliveryBagHandler } from "../unload-delivery-bag.handler.js";
import {
  bagOf,
  InMemoryBags,
  InMemoryStopLoadings,
  RecordingDepartedStops,
  stopOf,
} from "./loading-doubles.js";
import {
  deliveryOn,
  FixedDeliveryOrders,
  InMemoryDeliveryRounds,
  roundWith,
} from "./round-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);
const ORDERS = new FixedDeliveryOrders([deliveryOn("o_1", DAY), deliveryOn("o_2", DAY)]);
const BAGS = () =>
  new InMemoryBags(
    bagOf("b_1", "o_1", "AAAAAA"),
    bagOf("b_2", "o_1", "BBBBBB"),
    bagOf("b_9", "o_9", "ZZZZZZ"),
  );

function tools() {
  return {
    clock: new FixedClock(NOW),
    events: new RecordingPublisher(),
    uow: new DirectUnitOfWork(),
  };
}

describe("LoadDeliveryBagHandler — L4-C2, L4-C18", () => {
  function loader(loadings: InMemoryStopLoadings) {
    const { clock, events, uow } = tools();
    const handler = new LoadDeliveryBagHandler(
      BAGS(),
      loadings,
      ORDERS,
      new FixedIdGenerator("load"),
      clock,
      events,
      uow,
    );
    return { handler, events };
  }

  it("charge par le QR, et trace le moyen, la tournée et la commande", async () => {
    const loadings = new InMemoryStopLoadings(stopOf("o_1"));
    const { handler, events } = loader(loadings);

    await handler.execute(new LoadDeliveryBagCommand("r_1", { bagId: "b_1" }, "staff_1"));

    expect(loadings.stored("o_1")?.loads).toEqual([
      {
        id: "load_000001",
        bagId: "b_1",
        loadedAt: NOW,
        loadedBy: "staff_1",
        loadedVia: "scan",
        createdAt: NOW,
      },
    ]);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "delivery_bag.loaded",
      subjectType: "delivery_bag",
      subjectId: "b_1",
      payload: {
        subjectLabel: "AAAAAA",
        order: { id: "o_1", name: "CMD-o_1" },
        round: { id: "r_1", name: "Kangoo blanc" },
        day: DAY,
        passage: 1,
        via: "scan",
      },
    });
  });

  it("charge par le code tapé, en minuscules", async () => {
    const loadings = new InMemoryStopLoadings(stopOf("o_1"));
    const { handler } = loader(loadings);

    await handler.execute(new LoadDeliveryBagCommand("r_1", { code: "bbbbbb" }, "staff_1"));

    expect(loadings.stored("o_1")?.loads[0]).toMatchObject({ bagId: "b_2", loadedVia: "code" });
  });

  it("charger deux fois n'écrit et ne trace qu'une fois", async () => {
    const loadings = new InMemoryStopLoadings(stopOf("o_1"));
    const { handler, events } = loader(loadings);

    await handler.execute(new LoadDeliveryBagCommand("r_1", { bagId: "b_1" }, "staff_1"));
    await handler.execute(new LoadDeliveryBagCommand("r_1", { bagId: "b_1" }, "staff_2"));

    expect(loadings.saves).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
  });

  it("refuse un sac d'une autre tournée, en nommant son véhicule", async () => {
    const { handler, events } = loader(new InMemoryStopLoadings(stopOf("o_1")));

    await expect(
      handler.execute(new LoadDeliveryBagCommand("r_autre", { bagId: "b_1" }, "staff_1")),
    ).rejects.toThrow(BagInOtherRoundError);
    expect(events.traced).toEqual([]);
  });

  it("refuse un sac dont la commande n'est dans aucune tournée : « à répartir d'abord »", async () => {
    const { handler } = loader(new InMemoryStopLoadings());

    await expect(
      handler.execute(new LoadDeliveryBagCommand("r_1", { bagId: "b_1" }, "staff_1")),
    ).rejects.toThrow(BagOrderNotComposedError);
  });
});

describe("UnloadDeliveryBagHandler", () => {
  it("décharge, et le fait garde qui avait chargé", async () => {
    const loadings = new InMemoryStopLoadings(
      stopOf("o_1", {
        loads: [
          {
            id: "l_1",
            bagId: "b_1",
            loadedAt: NOW,
            loadedBy: "staff_7",
            loadedVia: "scan",
            createdAt: NOW,
          },
        ],
      }),
    );
    const { events, uow } = tools();
    const directory = new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Léa", lastName: "Martin", staffUserId: "staff_7" }, "staff_7"),
    );
    const handler = new UnloadDeliveryBagHandler(BAGS(), loadings, ORDERS, directory, events, uow);

    await handler.execute(new UnloadDeliveryBagCommand("r_1", "b_1"));

    expect(loadings.stored("o_1")?.loads[0]).toMatchObject({ loadedAt: null, loadedBy: null });
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      loadedAt: NOW.toISOString(),
      loadedBy: { id: "staff_7", name: "Léa Martin" },
    });
  });
});

describe("DepartDeliveryRoundHandler — L4-C4, Q14", () => {
  function depart(loadings: InMemoryStopLoadings) {
    const { clock, events, uow } = tools();
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1"]));
    const departed = new RecordingDepartedStops();
    const handler = new DepartDeliveryRoundHandler(
      rounds,
      loadings,
      departed,
      ORDERS,
      clock,
      events,
      uow,
    );
    return { handler, rounds, departed, events };
  }

  it("refuse un arrêt partiel, sans rien figer", async () => {
    const { handler, rounds, departed } = depart(new InMemoryStopLoadings(stopOf("o_1")));

    await expect(
      handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 })),
    ).rejects.toThrow(DeliveryRoundNotReadyError);
    expect(rounds.stored("r_1")?.departedAt).toBeNull();
    expect(departed.recorded).toEqual([]);
  });

  it("refuse un arrêt sans sac (L4-C17)", async () => {
    const { handler } = depart(new InMemoryStopLoadings(stopOf("o_1", { bags: [] })));

    await expect(
      handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 })),
    ).rejects.toThrow(/sans sac déclaré : CMD-o_1/u);
  });

  it("chargé : pose le départ, fige la feuille de chaque arrêt, et trace", async () => {
    const loaded = stopOf("o_1", {
      loads: ["b_1", "b_2"].map((bagId) => ({
        id: `l_${bagId}`,
        bagId,
        loadedAt: NOW,
        loadedBy: "staff_1",
        loadedVia: "scan" as const,
        createdAt: NOW,
      })),
    });
    const { handler, rounds, departed, events } = depart(new InMemoryStopLoadings(loaded));

    await handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 }));

    expect(rounds.stored("r_1")?.departedAt).toEqual(NOW);
    expect(departed.recorded).toEqual([
      {
        stopId: "r_1_s1",
        roundId: "r_1",
        serviceDay: DAY,
        departedAt: NOW,
        sheet: {
          orderId: "o_1",
          reference: "CMD-o_1",
          customerLabel: "Maison o_1",
          address: null,
          contact: null,
          window: null,
          signatureRequired: false,
          note: "note CMD-o_1",
          addressNote: null,
          status: "active",
        },
      },
    ]);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "delivery_round.departed",
      subjectType: "delivery_round",
      subjectId: "r_1",
      payload: { subjectLabel: "Véhicule v_1", day: DAY, passage: 1, stops: 1, bags: 2 },
    });
  });

  it("refuse une commande annulée depuis la composition, en la nommant", async () => {
    const { clock, events, uow } = tools();
    const loaded = stopOf("o_1", {
      loads: ["b_1", "b_2"].map((bagId) => ({
        id: `l_${bagId}`,
        bagId,
        loadedAt: NOW,
        loadedBy: "staff_1",
        loadedVia: "scan" as const,
        createdAt: NOW,
      })),
    });
    const departed = new RecordingDepartedStops();
    const handler = new DepartDeliveryRoundHandler(
      new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1"])),
      new InMemoryStopLoadings(loaded),
      departed,
      new FixedDeliveryOrders([deliveryOn("o_1", DAY, { status: "cancelled" })]),
      clock,
      events,
      uow,
    );

    await expect(
      handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 })),
    ).rejects.toThrow(/CMD-o_1 a été annulée\. Retirez l'arrêt/u);
    expect(departed.recorded).toEqual([]);
  });
});
