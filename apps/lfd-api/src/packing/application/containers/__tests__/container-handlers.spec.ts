import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ContainerMode } from "../../../domain/entities/packing-sheet.js";
import {
  ContainerBinGoneError,
  ContainersCountedError,
} from "../../../domain/errors/packing-container-errors.js";
import {
  LineNotProducedYetError,
  PackingOrderNotDrawnYetError,
} from "../../../domain/errors/packing-station-errors.js";
import { ScriptedBinDesk } from "../../__tests__/bin-desk-double.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemorySheets, InMemoryStocks } from "../../__tests__/station-doubles.js";
import { AllocateToContainerCommand } from "../allocate-to-container.command.js";
import { AllocateToContainerHandler } from "../allocate-to-container.handler.js";
import { GetPackingProposalHandler } from "../get-packing-proposal.handler.js";
import { GetPackingProposalQuery } from "../get-packing-proposal.query.js";
import { PackingContainerVoiding } from "../packing-container-voiding.js";
import { OpenPackingContainerCommand } from "../open-packing-container.command.js";
import { OpenPackingContainerHandler } from "../open-packing-container.handler.js";
import { VoidPackingContainerCommand } from "../void-packing-container.command.js";
import { VoidPackingContainerHandler } from "../void-packing-container.handler.js";
import { WithdrawFromContainerCommand } from "../withdraw-from-container.command.js";
import { WithdrawFromContainerHandler } from "../withdraw-from-container.handler.js";
import { InMemoryPackingSettings } from "../../__tests__/packing-settings-doubles.js";
import { RecordingPlanHold } from "../../__tests__/arrested-plan-doubles.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";

/** Une clé d'intention neuve par geste voulu. */
let intentCount = 0;
const nextKey = (): string => `intent_${(intentCount += 1)}`;

// Un jour comparé à rien, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);
const STAFF = "staff_1";

/** Un refus de la livraison, tel qu'il remonte par `BinDesk`. */
class DeliveryRefusal extends BusinessError {
  constructor() {
    super("delivery.bin_loaded", "Le bac est chargé : déchargez-le d'abord.");
  }
}

function setup(options: { readonly mode?: ContainerMode; readonly received?: number } = {}) {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received: options.received ?? 20, returned: 0 });
  const sheets = new InMemorySheets();
  sheets.put({
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 20, packed: null, saleUnit: "piece" },
    ],
    containerMode: options.mode ?? "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
  });
  const stocks = new InMemoryStocks(shadow);
  const desk = new ScriptedBinDesk();
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  return {
    sheets,
    stocks,
    desk,
    events,
    open: new OpenPackingContainerHandler(
      sheets,
      desk,
      new FixedIdGenerator("ctn"),
      clock,
      events,
      uow,
      InMemoryPackingSettings.sharingOpen().reader(),
      new RecordingPlanHold(),
      inMemoryIntents(),
    ),
    allocate: new AllocateToContainerHandler(
      sheets,
      stocks,
      desk,
      clock,
      events,
      uow,
      new RecordingPlanHold(),
      inMemoryIntents(),
    ),
    withdraw: new WithdrawFromContainerHandler(sheets, stocks, events, uow, inMemoryIntents()),
    void: new VoidPackingContainerHandler(
      sheets,
      new PackingContainerVoiding(stocks, desk, events),
      clock,
      uow,
    ),
  };
}

const BIN = { nature: "bin", binTypeId: "t_m", half: false, innerBags: 0 } as const;
const BAG = { nature: "bag" } as const;

describe("OpenPackingContainerHandler — un bac par la livraison, un sac ici", () => {
  /** Régression : un double clic sur « + Nouveau bac » ouvrait deux contenants et déclarait deux bacs. */
  it("rejouée avec la même clé, rend le même contenant sans déclarer de second bac", async () => {
    const { open, desk, sheets, events } = setup();
    const command = new OpenPackingContainerCommand(DAY, "ord_1", BIN, STAFF, nextKey());

    const first = await open.execute(command);
    const replayed = await open.execute(command);

    expect(replayed).toBe(first);
    expect(desk.declared).toHaveLength(1);
    expect(sheets.of(DAY, "ord_1")?.containerList).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
  });

  it("fait déclarer le bac par la livraison, et garde son id et son code", async () => {
    const { open, desk, sheets, events } = setup();

    const id = await open.execute(
      new OpenPackingContainerCommand(DAY, "ord_1", BIN, STAFF, nextKey()),
    );

    expect(id).toBe("ctn_000001");
    expect(desk.declared).toEqual([
      { orderId: "ord_1", binTypeId: "t_m", half: false, innerBags: 0 },
    ]);
    expect(sheets.of(DAY, "ord_1")?.containerList).toEqual([
      expect.objectContaining({
        id,
        nature: "bin",
        bin: { binId: "bin_1", code: "CODE01", half: null },
      }),
    ]);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "packing_container.opened",
      subjectType: "order",
      subjectId: "ord_1",
      payload: {
        subjectLabel: "ORD-0001",
        container: { id, name: "CODE01" },
        nature: "bin",
      },
    });
  });

  it("partage l'autre moitié d'un bac par la livraison", async () => {
    const { open, desk } = setup();

    await open.execute(
      new OpenPackingContainerCommand(
        DAY,
        "ord_1",
        { nature: "bin", partnerBinId: "b_left", innerBags: 1 },
        STAFF,
        nextKey(),
      ),
    );

    expect(desk.shared).toEqual([{ orderId: "ord_1", partnerBinId: "b_left", innerBags: 1 }]);
  });

  it("ouvre un sac sans rien demander à la livraison", async () => {
    const { open, desk, events } = setup();

    await open.execute(new OpenPackingContainerCommand(DAY, "ord_1", BAG, STAFF, nextKey()));

    expect(desk.declared).toEqual([]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      container: { name: "Sac 1" },
      nature: "bag",
    });
  });

  it("remonte le refus de la livraison tel quel, sans contenant", async () => {
    const { open, desk, sheets } = setup();
    desk.refusal = new DeliveryRefusal();

    await expect(
      open.execute(new OpenPackingContainerCommand(DAY, "ord_1", BIN, STAFF, nextKey())),
    ).rejects.toThrow(DeliveryRefusal);
    expect(sheets.of(DAY, "ord_1")?.containerList).toEqual([]);
  });

  it("refuse sur une commande `counted` AVANT de faire naître un bac", async () => {
    const { open, desk } = setup({ mode: "counted" });

    await expect(
      open.execute(new OpenPackingContainerCommand(DAY, "ord_1", BIN, STAFF, nextKey())),
    ).rejects.toThrow(ContainersCountedError);
    expect(desk.declared).toEqual([]);
  });

  it("refuse une commande que la liste n'a pas encore livrée", async () => {
    const { open } = setup();

    await expect(
      open.execute(new OpenPackingContainerCommand(DAY, "ord_x", BAG, STAFF, nextKey())),
    ).rejects.toThrow(PackingOrderNotDrawnYetError);
  });
});

describe("AllocateToContainerHandler / WithdrawFromContainerHandler — la réserve garde", () => {
  async function withBag() {
    const context = setup();
    const id = await context.open.execute(
      new OpenPackingContainerCommand(DAY, "ord_1", BAG, STAFF, nextKey()),
    );
    return { ...context, id };
  }

  it("prend les pièces à la réserve, et les rend au retrait", async () => {
    const { allocate, withdraw, stocks, events, id } = await withBag();

    await allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", id, "CRO", 12, STAFF, nextKey()),
    );
    expect(stocks.packedOf(DAY, "CRO")).toBe(12);

    await withdraw.execute(
      new WithdrawFromContainerCommand(DAY, "ord_1", id, "CRO", 2, STAFF, nextKey()),
    );
    expect(stocks.packedOf(DAY, "CRO")).toBe(10);
    expect(events.factTypes()).toEqual([
      "packing_container.opened",
      "packing_container.filled",
      "packing_container.emptied",
    ]);
  });

  it("refuse ce qui n'est pas sorti du four, en disant combien il en manque", async () => {
    const context = setup({ received: 5 });
    const id = await context.open.execute(
      new OpenPackingContainerCommand(DAY, "ord_1", BAG, STAFF, nextKey()),
    );

    await expect(
      context.allocate.execute(
        new AllocateToContainerCommand(DAY, "ord_1", id, "CRO", 8, STAFF, nextKey()),
      ),
    ).rejects.toThrow(LineNotProducedYetError);
  });

  it("refuse un bac que la livraison ne connaît plus vivant (défense en profondeur)", async () => {
    const context = setup();
    const id = await context.open.execute(
      new OpenPackingContainerCommand(DAY, "ord_1", BIN, STAFF, nextKey()),
    );
    context.desk.dead.add("bin_1");

    await expect(
      context.allocate.execute(
        new AllocateToContainerCommand(DAY, "ord_1", id, "CRO", 1, STAFF, nextKey()),
      ),
    ).rejects.toThrow(ContainerBinGoneError);
  });

  /**
   * Régression (audit final du réassort, 2026-11-03) : le bac était dit
   * vivant par une lecture sans verrou, et une annulation pouvait passer
   * entre la question et la mise au bac.
   */
  it("tient le bac chez la livraison avant d'y mettre des pièces", async () => {
    const context = setup();
    const id = await context.open.execute(
      new OpenPackingContainerCommand(DAY, "ord_1", BIN, STAFF, nextKey()),
    );

    await context.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", id, "CRO", 1, STAFF, nextKey()),
    );

    expect(context.desk.heldBins).toEqual(["bin_1"]);
  });
});

describe("VoidPackingContainerHandler — un bac s'annule d'abord chez la livraison", () => {
  it("annule le bac, puis le contenant, et rend ce qu'il portait", async () => {
    const context = setup();
    const id = await context.open.execute(
      new OpenPackingContainerCommand(DAY, "ord_1", BIN, STAFF, nextKey()),
    );
    await context.allocate.execute(
      new AllocateToContainerCommand(DAY, "ord_1", id, "CRO", 7, STAFF, nextKey()),
    );

    await context.void.execute(new VoidPackingContainerCommand(DAY, "ord_1", id, STAFF));

    expect(context.desk.voided).toEqual(["bin_1"]);
    expect(context.stocks.packedOf(DAY, "CRO")).toBe(0);
    expect(context.sheets.of(DAY, "ord_1")?.containerList[0]?.voided).toEqual({
      at: NOW,
      by: STAFF,
    });
    expect(context.events.factTypes()).toContain("packing_container.voided");
  });

  it("refusé par la livraison (bac chargé) : le contenant reste tel quel", async () => {
    const context = setup();
    const id = await context.open.execute(
      new OpenPackingContainerCommand(DAY, "ord_1", BIN, STAFF, nextKey()),
    );
    context.desk.refusal = new DeliveryRefusal();

    await expect(
      context.void.execute(new VoidPackingContainerCommand(DAY, "ord_1", id, STAFF)),
    ).rejects.toThrow(DeliveryRefusal);
    expect(context.sheets.of(DAY, "ord_1")?.containerList[0]?.voided).toBeNull();
  });
});

describe("GetPackingProposalHandler — « Proposer »", () => {
  it("rend la proposition de la livraison, sans rien écrire", async () => {
    const desk = new ScriptedBinDesk();

    const view = await new GetPackingProposalHandler(desk).execute(
      new GetPackingProposalQuery("ord_1"),
    );

    expect(view.orderId).toBe("ord_1");
    expect(desk.declared).toEqual([]);
  });
});
