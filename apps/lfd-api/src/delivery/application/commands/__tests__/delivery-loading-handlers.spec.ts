import { FixedStaffPermissionHolders } from "../../../../staff/directory/domain/__tests__/fixed-staff-permission-holders.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  BinInOtherRoundError,
  BinOrderNotComposedError,
  DeliveryRoundNotReadyError,
} from "../../../domain/errors/delivery-loading-errors.js";
import { DepartDeliveryRoundCommand } from "../depart-delivery-round.command.js";
import { DepartDeliveryRoundHandler } from "../depart-delivery-round.handler.js";
import { LoadDeliveryBinCommand } from "../load-delivery-bin.command.js";
import { LoadDeliveryBinHandler } from "../load-delivery-bin.handler.js";
import { UnloadDeliveryBinCommand } from "../unload-delivery-bin.command.js";
import { UnloadDeliveryBinHandler } from "../unload-delivery-bin.handler.js";
import {
  binOf,
  FixedDepartureHolds,
  InMemoryBins,
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
import { FixedDoorstepSettings, RecordingDurable } from "./decision-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);
const ORDERS = new FixedDeliveryOrders([deliveryOn("o_1", DAY), deliveryOn("o_2", DAY)]);
const BINS = () =>
  new InMemoryBins(
    binOf("b_1", "o_1", "AAAAAA"),
    binOf("b_2", "o_1", "BBBBBB"),
    binOf("b_9", "o_9", "ZZZZZZ"),
  );

function tools() {
  return {
    clock: new FixedClock(NOW),
    events: new RecordingPublisher(),
    uow: new DirectUnitOfWork(),
  };
}

describe("LoadDeliveryBinHandler — L4-C2, L4-C18", () => {
  function loader(loadings: InMemoryStopLoadings) {
    const { clock, events, uow } = tools();
    const handler = new LoadDeliveryBinHandler(
      BINS(),
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

    await handler.execute(new LoadDeliveryBinCommand("r_1", { binId: "b_1" }, "staff_1"));

    expect(loadings.stored("o_1")?.loads).toEqual([
      {
        id: "load_000001",
        binId: "b_1",
        loadedAt: NOW,
        loadedBy: "staff_1",
        loadedVia: "scan",
        createdAt: NOW,
      },
    ]);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "delivery_bin.loaded",
      subjectType: "delivery_bin",
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

    await handler.execute(new LoadDeliveryBinCommand("r_1", { code: "bbbbbb" }, "staff_1"));

    expect(loadings.stored("o_1")?.loads[0]).toMatchObject({ binId: "b_2", loadedVia: "code" });
  });

  it("charger deux fois n'écrit et ne trace qu'une fois", async () => {
    const loadings = new InMemoryStopLoadings(stopOf("o_1"));
    const { handler, events } = loader(loadings);

    await handler.execute(new LoadDeliveryBinCommand("r_1", { binId: "b_1" }, "staff_1"));
    await handler.execute(new LoadDeliveryBinCommand("r_1", { binId: "b_1" }, "staff_2"));

    expect(loadings.saves).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
  });

  it("refuse un bac d'une autre tournée, en nommant son véhicule", async () => {
    const { handler, events } = loader(new InMemoryStopLoadings(stopOf("o_1")));

    await expect(
      handler.execute(new LoadDeliveryBinCommand("r_autre", { binId: "b_1" }, "staff_1")),
    ).rejects.toThrow(BinInOtherRoundError);
    expect(events.traced).toEqual([]);
  });

  it("refuse un bac dont la commande n'est dans aucune tournée : « à répartir d'abord »", async () => {
    const { handler } = loader(new InMemoryStopLoadings());

    await expect(
      handler.execute(new LoadDeliveryBinCommand("r_1", { binId: "b_1" }, "staff_1")),
    ).rejects.toThrow(BinOrderNotComposedError);
  });
});

describe("UnloadDeliveryBinHandler", () => {
  it("décharge, et le fait garde qui avait chargé", async () => {
    const loadings = new InMemoryStopLoadings(
      stopOf("o_1", {
        loads: [
          {
            id: "l_1",
            binId: "b_1",
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
    const handler = new UnloadDeliveryBinHandler(BINS(), loadings, ORDERS, directory, events, uow);

    await handler.execute(new UnloadDeliveryBinCommand("r_1", "b_1"));

    expect(loadings.stored("o_1")?.loads[0]).toMatchObject({ loadedAt: null, loadedBy: null });
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      loadedAt: NOW.toISOString(),
      loadedBy: { id: "staff_7", name: "Léa Martin" },
    });
  });
});

describe("DepartDeliveryRoundHandler — L4-C4, Q14", () => {
  function depart(loadings: InMemoryStopLoadings, holds = new FixedDepartureHolds()) {
    const { clock, events, uow } = tools();
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1"]));
    const departed = new RecordingDepartedStops();
    const durable = new RecordingDurable();
    const handler = new DepartDeliveryRoundHandler(
      rounds,
      loadings,
      departed,
      ORDERS,
      holds,
      new FixedDoorstepSettings(),
      clock,
      events,
      uow,
      durable,
      new FixedStaffPermissionHolders(),
    );
    return { handler, rounds, departed, events, durable };
  }

  it("refuse un arrêt partiel, sans rien figer", async () => {
    const { handler, rounds, departed, durable } = depart(new InMemoryStopLoadings(stopOf("o_1")));

    await expect(
      handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 })),
    ).rejects.toThrow(DeliveryRoundNotReadyError);
    expect(rounds.stored("r_1")?.departedAt).toBeNull();
    expect(departed.recorded).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("refuse un arrêt sans bac (L4-C17)", async () => {
    const { handler } = depart(new InMemoryStopLoadings(stopOf("o_1", { bins: [] })));

    await expect(
      handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 })),
    ).rejects.toThrow(/sans bac déclaré : CMD-o_1/u);
  });

  it("chargé : pose le départ, fige la feuille de chaque arrêt, et trace", async () => {
    const loaded = stopOf("o_1", {
      loads: ["b_1", "b_2"].map((binId) => ({
        id: `l_${binId}`,
        binId,
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
          // Figé avec la feuille (plan « À la porte », AP-D5).
          depositAllowed: false,
          // L'adresse ne redéfinit rien (B3 bis).
          doorstepRule: null,
          // Aucun stationnement au carnet : rien de figé (§6).
          parking: null,
          status: "active",
        },
        // Le rang de passage et le point du carnet, figés au départ (MT-D5 v2).
        departureRank: 1,
        gps: null,
        // Ni adresse ni réglage global : « Me demander », figé (B3 bis).
        doorstepRule: "ask",
      },
    ]);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "delivery_round.departed",
      subjectType: "delivery_round",
      subjectId: "r_1",
      payload: { subjectLabel: "Véhicule v_1", day: DAY, passage: 1, stops: 1, bins: 2 },
    });
  });

  /** Lot 4 bis, v2-4 : l'autre commande du bac partagé a quitté la tournée. */
  it("refuse un arrêt chargé dont un bac partagé est à refaire, sans rien figer", async () => {
    const loaded = stopOf("o_1", {
      bins: [{ id: "h_1", code: "HHHHHH", voided: false, partnerOrderId: "o_2" }],
      loads: [
        {
          id: "l_h",
          binId: "h_1",
          loadedAt: NOW,
          loadedBy: "staff_1",
          loadedVia: "scan",
          createdAt: NOW,
        },
      ],
    });
    const { handler, rounds, departed } = depart(new InMemoryStopLoadings(loaded));

    await expect(
      handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 })),
    ).rejects.toThrow(
      "« Véhicule v_1 » ne peut pas partir — le bac partagé HHHHHH (CMD-o_1) n'est plus entre deux arrêts consécutifs : recolisez-le ou remettez les arrêts côte à côte.",
    );
    expect(rounds.stored("r_1")?.departedAt).toBeNull();
    expect(departed.recorded).toEqual([]);
  });

  it("refuse une commande annulée depuis la composition, en la nommant", async () => {
    const { clock, events, uow } = tools();
    const loaded = stopOf("o_1", {
      loads: ["b_1", "b_2"].map((binId) => ({
        id: `l_${binId}`,
        binId,
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
      new FixedDepartureHolds(),
      new FixedDoorstepSettings(),
      clock,
      events,
      uow,
      new RecordingDurable(),
      new FixedStaffPermissionHolders(),
    );

    await expect(
      handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 })),
    ).rejects.toThrow(/CMD-o_1 a été annulée\. Retirez l'arrêt/u);
    expect(departed.recorded).toEqual([]);
  });
});
