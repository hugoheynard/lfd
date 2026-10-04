import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  BinCodeExhaustedError,
  BinLoadedError,
  BinsNotDeclarableError,
  DeliveryBinNotFoundError,
  DeliveryRoundDepartedError,
} from "../../../domain/errors/delivery-loading-errors.js";
import {
  BinTypeArchivedForDeclarationError,
  BinTypeNotDivisibleError,
  InvalidBinDeclarationCountError,
  InvalidInnerBagsError,
} from "../../../domain/errors/delivery-bin-declaration-errors.js";
import { BinTypeNotFoundError } from "../../../domain/errors/delivery-bin-errors.js";
import { DeliveryBinOffice } from "../../delivery-bin-office.js";
import { DeclareDeliveryBinsCommand } from "../declare-delivery-bins.command.js";
import { DeclareDeliveryBinsHandler } from "../declare-delivery-bins.handler.js";
import { VoidDeliveryBinCommand } from "../void-delivery-bin.command.js";
import { VoidDeliveryBinHandler } from "../void-delivery-bin.handler.js";
import {
  binOf,
  binTypeOf,
  FixedBinTypeLookup,
  InMemoryBins,
  InMemoryStopLoadings,
  ScriptedDrawer,
  stopOf,
} from "./loading-doubles.js";
import { FixedManagedOrders } from "./managed-orders-double.js";
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

/** Une déclaration pour `o_1`, un Bac M entier, zéro sac dedans — sauf ce qu'on précise. */
function declaring(
  overrides: Partial<DeclareDeliveryBinsCommand["payload"]>,
): DeclareDeliveryBinsCommand {
  return new DeclareDeliveryBinsCommand({
    orderId: "o_1",
    binTypeId: "t_m",
    whole: 0,
    half: false,
    innerBags: 0,
    ...overrides,
  });
}

describe("DeclareDeliveryBinsHandler — L4-C16, L4-C20, lot 4 bis", () => {
  function declare(options: {
    readonly bins?: InMemoryBins;
    readonly loadings?: InMemoryStopLoadings;
    readonly codes?: readonly string[];
  }) {
    const { clock, events, uow } = tools();
    const bins = options.bins ?? new InMemoryBins();
    const handler = new DeclareDeliveryBinsHandler(
      new DeliveryBinOffice(
        bins,
        new FixedBinTypeLookup(
          binTypeOf("t_m"),
          binTypeOf("t_s", { divisible: false }),
          binTypeOf("t_old", { archived: true }),
        ),
        options.loadings ?? new InMemoryStopLoadings(),
        ORDERS,
        new ScriptedDrawer(options.codes ?? ["AAAAAA", "BBBBBB", "CCCCCC"]),
        new FixedIdGenerator("bin"),
        clock,
        events,
        uow,
      ),
      new FixedManagedOrders(),
    );
    return { handler, bins, events };
  }

  it("crée n bacs entiers typés, chacun son code, et UN fait qui les nomme", async () => {
    const { handler, bins, events } = declare({});

    const ids = await handler.execute(declaring({ whole: 2, innerBags: 3 }));

    expect(ids).toEqual(["bin_000001", "bin_000002"]);
    expect([...bins.byId.values()].map((bin) => bin.toSnapshot())).toEqual([
      expect.objectContaining({
        code: "AAAAAA",
        binTypeId: "t_m",
        half: null,
        physicalBinId: null,
        innerBags: 3,
      }),
      expect.objectContaining({
        code: "BBBBBB",
        binTypeId: "t_m",
        half: null,
        physicalBinId: null,
        innerBags: 3,
      }),
    ]);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "delivery_bin.declared",
        subjectType: "order",
        subjectId: "o_1",
        payload: {
          subjectLabel: "CMD-o_1",
          binType: { id: "t_m", name: "Bac t_m" },
          innerBags: 3,
          bins: [
            { bin: { id: "bin_000001", name: "AAAAAA" }, half: null },
            { bin: { id: "bin_000002", name: "BBBBBB" }, half: null },
          ],
        },
      },
    ]);
  });

  it("retire un code déjà porté par un bac, annulé compris", async () => {
    const { handler, bins } = declare({
      bins: new InMemoryBins(binOf("b_old", "o_x", "AAAAAA")),
      codes: ["AAAAAA", "CCCCCC"],
    });

    await handler.execute(declaring({ whole: 1 }));

    expect(bins.byId.get("bin_000001")?.code).toBe("CCCCCC");
  });

  it("une source d'aléa qui ne rend que des codes pris finit en refus, pas en boucle", async () => {
    const { handler } = declare({
      bins: new InMemoryBins(binOf("b_old", "o_x", "AAAAAA")),
      codes: ["AAAAAA"],
    });

    await expect(handler.execute(declaring({ whole: 1 }))).rejects.toThrow(BinCodeExhaustedError);
  });

  it.each([
    ["inconnue", "o_x"],
    ["annulée", "o_cancel"],
    ["en retrait", "o_pickup"],
  ])("refuse une commande %s, sans rien écrire", async (_label, orderId) => {
    const { handler, bins, events } = declare({});

    await expect(handler.execute(declaring({ orderId, whole: 1 }))).rejects.toThrow(
      BinsNotDeclarableError,
    );
    expect(bins.byId.size).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("déclare une moitié : la gauche d'un bac physique neuf, après les entiers", async () => {
    const { handler, bins } = declare({});

    await handler.execute(declaring({ whole: 1, half: true }));

    const [whole, half] = [...bins.byId.values()].map((bin) => bin.toSnapshot());
    expect(whole).toMatchObject({ half: null, physicalBinId: null });
    // Les ids : deux bacs, puis le bac physique.
    expect(half).toMatchObject({ half: "left", physicalBinId: "bin_000003" });
  });

  it.each([
    [
      "une moitié d'un type sans cloison",
      { binTypeId: "t_s", whole: 0, half: true },
      BinTypeNotDivisibleError,
    ],
    ["un type archivé", { binTypeId: "t_old", whole: 1 }, BinTypeArchivedForDeclarationError],
    ["zéro bac", { whole: 0 }, InvalidBinDeclarationCountError],
    ["vingt et un bacs entiers", { whole: 21 }, InvalidBinDeclarationCountError],
    ["des sacs négatifs", { whole: 1, innerBags: -1 }, InvalidInnerBagsError],
    ["un type inconnu", { binTypeId: "t_x", whole: 1 }, BinTypeNotFoundError],
  ] as const)("refuse %s, sans rien écrire", async (_label, payload, error) => {
    const { handler, bins, events } = declare({});

    await expect(handler.execute(declaring(payload))).rejects.toThrow(error);
    expect(bins.byId.size).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("refuse un bac de plus pour une commande dont la tournée est partie", async () => {
    const { handler } = declare({
      loadings: new InMemoryStopLoadings(stopOf("o_1", { departedAt: NOW })),
    });

    await expect(handler.execute(declaring({ whole: 1 }))).rejects.toThrow(
      DeliveryRoundDepartedError,
    );
  });
});

describe("VoidDeliveryBinHandler — L4-C19", () => {
  function voiding(
    loadings: InMemoryStopLoadings,
    bins = new InMemoryBins(binOf("b_1", "o_1", "AAAAAA")),
  ) {
    const { clock, events, uow } = tools();
    return {
      handler: new VoidDeliveryBinHandler(
        new DeliveryBinOffice(
          bins,
          new FixedBinTypeLookup(),
          loadings,
          ORDERS,
          new ScriptedDrawer([]),
          new FixedIdGenerator("bin"),
          clock,
          events,
          uow,
        ),
        new FixedManagedOrders(),
      ),
      bins,
      events,
    };
  }

  it("annule, et trace le bac et sa commande", async () => {
    const { handler, bins, events } = voiding(new InMemoryStopLoadings(stopOf("o_1")));

    await handler.execute(new VoidDeliveryBinCommand("b_1"));

    expect(bins.byId.get("b_1")?.voidedAt).toEqual(NOW);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "delivery_bin.voided",
      subjectType: "delivery_bin",
      subjectId: "b_1",
      payload: { subjectLabel: "AAAAAA", order: { id: "o_1", name: "CMD-o_1" } },
    });
  });

  it("refuse un bac chargé", async () => {
    const loaded = stopOf("o_1", {
      loads: [
        {
          id: "l_1",
          binId: "b_1",
          loadedAt: NOW,
          loadedBy: "staff_1",
          loadedVia: "scan",
          createdAt: NOW,
        },
      ],
    });
    const { handler, bins } = voiding(new InMemoryStopLoadings(loaded));

    await expect(handler.execute(new VoidDeliveryBinCommand("b_1"))).rejects.toThrow(
      BinLoadedError,
    );
    expect(bins.byId.get("b_1")?.voidedAt).toBeNull();
  });

  it("un bac inconnu répond 404", async () => {
    const { handler } = voiding(new InMemoryStopLoadings());

    await expect(handler.execute(new VoidDeliveryBinCommand("b_x"))).rejects.toThrow(
      DeliveryBinNotFoundError,
    );
  });

  it("annuler un bac déjà annulé n'écrit rien", async () => {
    const { handler, events } = voiding(new InMemoryStopLoadings());
    await handler.execute(new VoidDeliveryBinCommand("b_1"));

    await handler.execute(new VoidDeliveryBinCommand("b_1"));

    expect(events.traced).toHaveLength(1);
  });
});
