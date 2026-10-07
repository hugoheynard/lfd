import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { BinsManagedAtPackingError } from "../../../domain/errors/delivery-bin-declaration-errors.js";
import { DeliveryBinDesk } from "../../delivery-bin-desk.js";
import { DeliveryBinOffice } from "../../delivery-bin-office.js";
import { DeclareDeliveryBinsCommand } from "../declare-delivery-bins.command.js";
import { DeclareDeliveryBinsHandler } from "../declare-delivery-bins.handler.js";
import { ShareDeliveryBinCommand } from "../share-delivery-bin.command.js";
import { ShareDeliveryBinHandler } from "../share-delivery-bin.handler.js";
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
import { FixedDeclaredBins } from "../../queries/__tests__/capacity-doubles.js";
import {
  binTypeView,
  FixedLoading,
  FixedOrderLines,
} from "../../queries/__tests__/packing-doubles.js";
import { GetDeliveryBinFreeHalvesHandler } from "../../queries/get-delivery-bin-free-halves.handler.js";
import { GetDeliveryPackingProposalHandler } from "../../queries/get-delivery-packing-proposal.handler.js";
import { FixedBinCatalog, FixedDeliveryProducts } from "./bin-doubles.js";
import { FixedManagedOrders } from "./managed-orders-double.js";
import { deliveryOn, FixedDeliveryOrders } from "./round-doubles.js";

const CAPACITY = { binTypeId: "t_m", sku: "CRO", units: 30 };

// Un jour comparé à rien, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);

/**
 * K2b, §5.1 B1 : une commande dont les contenants se listent au colisage n'a
 * qu'une porte pour ses bacs — `BinDesk`. Les trois anciennes routes refusent,
 * et `DeliveryBinDesk` (la porte) applique les MÊMES règles qu'elles.
 */
function setup(bins = new InMemoryBins(binOf("b_1", "o_listed", "AAAAAA"))) {
  const events = new RecordingPublisher();
  const office = new DeliveryBinOffice(
    bins,
    new FixedBinTypeLookup(binTypeOf("t_m"), binTypeOf("t_old", { archived: true })),
    new InMemoryStopLoadings(stopOf("o_listed"), stopOf("o_counted")),
    new FixedDeliveryOrders([
      deliveryOn("o_listed", DAY),
      deliveryOn("o_counted", DAY),
      deliveryOn("o_pickup", DAY, { delivery: false }),
    ]),
    new ScriptedDrawer(["CCCCCC", "DDDDDD"]),
    new FixedIdGenerator("bin"),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  const managed = new FixedManagedOrders("o_listed");
  return { bins, events, office, managed };
}

describe("Les anciennes routes des bacs — refusées pour une commande gérée au colisage", () => {
  it("refuse de déclarer, en nommant le geste de sortie", async () => {
    const { office, managed, bins } = setup();
    const handler = new DeclareDeliveryBinsHandler(office, managed);
    const command = new DeclareDeliveryBinsCommand({
      orderId: "o_listed",
      binTypeId: "t_m",
      whole: 1,
      half: false,
      innerBags: 0,
    });

    await expect(handler.execute(command)).rejects.toThrow(BinsManagedAtPackingError);
    await expect(handler.execute(command)).rejects.toThrow(/colonne Contenants/u);
    expect(bins.byId.size).toBe(1);
  });

  it("refuse d'annuler un bac d'une commande gérée au colisage", async () => {
    const { office, managed, bins } = setup();

    await expect(
      new VoidDeliveryBinHandler(office, managed).execute(new VoidDeliveryBinCommand("b_1")),
    ).rejects.toThrow(BinsManagedAtPackingError);
    expect(bins.byId.get("b_1")?.voidedAt).toBeNull();
  });

  it("refuse de partager une moitié pour une commande gérée au colisage", async () => {
    const { office, managed } = setup();

    await expect(
      new ShareDeliveryBinHandler(office, managed).execute(
        new ShareDeliveryBinCommand({ orderId: "o_listed", partnerBinId: "b_1", innerBags: 0 }),
      ),
    ).rejects.toThrow(BinsManagedAtPackingError);
  });

  it("laisse déclarer pour une commande qui compte encore ses contenants", async () => {
    const { office, managed } = setup();

    const ids = await new DeclareDeliveryBinsHandler(office, managed).execute(
      new DeclareDeliveryBinsCommand({
        orderId: "o_counted",
        binTypeId: "t_m",
        whole: 1,
        half: false,
        innerBags: 0,
      }),
    );

    expect(ids).toHaveLength(1);
  });
});

describe("DeliveryBinDesk — la porte du colisage, aux règles de la livraison", () => {
  function desk() {
    const context = setup();
    return {
      ...context,
      desk: new DeliveryBinDesk(
        context.office,
        new GetDeliveryPackingProposalHandler(
          new FixedDeliveryOrders([deliveryOn("o_listed", DAY)]),
          new FixedOrderLines(new Map()),
          new FixedDeliveryProducts([]),
          new FixedBinCatalog([], []),
          new FixedLoading([]),
        ),
        new GetDeliveryBinFreeHalvesHandler(
          new FixedLoading([]),
          new FixedDeliveryOrders([deliveryOn("o_listed", DAY)]),
        ),
        new FixedBinCatalog(
          [binTypeView("t_iso", { isotherm: true }), binTypeView("t_dry")],
          [CAPACITY],
        ),
        new FixedDeclaredBins([
          { orderId: "o_listed", id: "b_iso", binTypeId: "t_iso", half: null, physicalBinId: null },
          { orderId: "o_listed", id: "b_dry", binTypeId: "t_dry", half: null, physicalBinId: null },
          { orderId: "o_other", id: "b_far", binTypeId: "t_iso", half: null, physicalBinId: null },
        ]),
        new FixedDeliveryProducts([
          { sku: "FLAN", name: "Flan", requiresCold: true },
          { sku: "PAIN", name: "Pain", requiresCold: false },
        ]),
      ),
    };
  }

  it("dit le froid des commandes : les SKU froids, et leurs seuls bacs isothermes", async () => {
    const { desk: guichet } = desk();

    const cold = await guichet.coldPacking(["o_listed"]);

    expect([...cold.coldSkus]).toEqual(["FLAN"]);
    expect([...cold.isothermBinIds]).toEqual(["b_iso"]);
    expect((await guichet.coldPacking([])).coldSkus.size).toBe(0);
  });

  it("déclare un bac entier, et rend son id, son code et sa moitié", async () => {
    const { desk: target, events } = desk();

    const bin = await target.declareBin({
      orderId: "o_listed",
      binTypeId: "t_m",
      half: false,
      innerBags: 0,
    });

    expect(bin).toEqual({ binId: "bin_000001", code: "CCCCCC", half: null });
    expect(events.factTypes()).toEqual(["delivery_bin.declared"]);
  });

  it("déclare une moitié : la gauche d'un bac neuf", async () => {
    const { desk: target } = desk();

    const bin = await target.declareBin({
      orderId: "o_listed",
      binTypeId: "t_m",
      half: true,
      innerBags: 0,
    });

    expect(bin.half).toBe("left");
  });

  it("remonte les refus de la livraison tels quels (type archivé, retrait)", async () => {
    const { desk: target } = desk();

    await expect(
      target.declareBin({ orderId: "o_listed", binTypeId: "t_old", half: false, innerBags: 0 }),
    ).rejects.toThrow(/archiv/u);
    await expect(
      target.declareBin({ orderId: "o_pickup", binTypeId: "t_m", half: false, innerBags: 0 }),
    ).rejects.toThrow(/retrait au comptoir/u);
  });

  it("propose par le cas de lecture de la livraison, sans rien écrire", async () => {
    const { desk: target, bins } = desk();

    const view = await target.propose("o_listed");

    expect(view).toMatchObject({ orderId: "o_listed", bins: [], unplaced: [] });
    expect(bins.byId.size).toBe(1);
  });

  it("sert au colisage les contenances qu'a lues la proposition", async () => {
    const { desk: target } = desk();

    expect(await target.capacities()).toEqual([CAPACITY]);
  });

  it("liste les moitiés libres par le cas de lecture de la livraison, et ses refus", async () => {
    const { desk: target } = desk();

    expect(await target.freeHalves("o_listed")).toMatchObject({
      orderId: "o_listed",
      round: null,
      halves: [],
    });
    await expect(target.freeHalves("o_unknown")).rejects.toThrow();
  });

  it("annule un bac, et ne le dit plus vivant", async () => {
    const { desk: target } = desk();

    expect(await target.liveBins(["b_1", "b_unknown"])).toEqual(new Set(["b_1"]));
    await target.voidBin("b_1");

    expect(await target.liveBins(["b_1"])).toEqual(new Set());
  });
});
