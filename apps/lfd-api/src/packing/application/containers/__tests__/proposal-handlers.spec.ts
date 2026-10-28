import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  EmptyProposalError,
  ProposalOverContainersError,
} from "../../../domain/errors/packing-container-errors.js";
import { ScriptedBinDesk } from "../../__tests__/bin-desk-double.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { InMemorySheets, InMemoryStocks } from "../../__tests__/station-doubles.js";
import { ApplyPackingProposalCommand } from "../apply-packing-proposal.command.js";
import { ApplyPackingProposalHandler } from "../apply-packing-proposal.handler.js";
import { GetShareableHalvesHandler } from "../get-shareable-halves.handler.js";
import { GetShareableHalvesQuery } from "../get-shareable-halves.query.js";
import { OpenPackingContainerCommand } from "../open-packing-container.command.js";
import { OpenPackingContainerHandler } from "../open-packing-container.handler.js";
import { InMemoryPackingSettings } from "../../__tests__/packing-settings-doubles.js";

// Un jour comparé à rien, jamais à l'horloge.
const DAY = "2030-03-12";
const STAFF = "staff_1";

/** Un refus de la livraison, tel qu'il remonte par `BinDesk`. */
class RoundDeparted extends BusinessError {
  constructor() {
    super("delivery.round_departed", "La tournée est partie.");
  }
}

/** Deux bacs M entiers et une moitié : 70 croissants à 30 par bac. */
const ENTRY = {
  binTypeId: "t_m",
  binTypeName: "Bac M",
  isotherm: false,
  cold: false,
  whole: 2,
  half: true,
  fill: 0.67,
  content: [{ sku: "CRO", quantity: 70 }],
};

function setup(received = 70) {
  const shadow = new InMemoryShadow();
  shadow.stocks.set(`${DAY}/CRO`, { received, returned: 0 });
  const sheets = new InMemorySheets();
  sheets.put({
    serviceDay: DAY,
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 70, packed: null, saleUnit: "piece" },
    ],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "delivery",
  });
  const stocks = new InMemoryStocks(shadow);
  const desk = new ScriptedBinDesk();
  desk.proposedBins = [ENTRY];
  desk.grid = [{ binTypeId: "t_m", sku: "CRO", units: 30 }];
  const events = new RecordingPublisher();
  const ids = new FixedIdGenerator("ctn");
  const clock = new FixedClock(new Date(0));
  const uow = new DirectUnitOfWork();
  return {
    sheets,
    stocks,
    desk,
    events,
    apply: new ApplyPackingProposalHandler(sheets, stocks, desk, ids, clock, events, uow),
    open: new OpenPackingContainerHandler(
      sheets,
      desk,
      ids,
      clock,
      events,
      uow,
      InMemoryPackingSettings.sharingOpen().reader(),
    ),
  };
}

const COMMAND = new ApplyPackingProposalCommand(DAY, "ord_1", STAFF);

describe("ApplyPackingProposalHandler — « Proposer », appliqué d'un coup, bac par bac", () => {
  it("déclare chaque bac par la livraison et le remplit avant le suivant", async () => {
    const { apply, desk, sheets, stocks, events } = setup();

    await apply.execute(COMMAND);

    expect(desk.declared).toEqual([
      { orderId: "ord_1", binTypeId: "t_m", half: false, innerBags: 0 },
      { orderId: "ord_1", binTypeId: "t_m", half: false, innerBags: 0 },
      { orderId: "ord_1", binTypeId: "t_m", half: true, innerBags: 0 },
    ]);
    const sheet = sheets.of(DAY, "ord_1");
    expect(sheet?.containerList.map((container) => container.lines)).toEqual([
      [{ sku: "CRO", quantity: 30 }],
      [{ sku: "CRO", quantity: 30 }],
      [{ sku: "CRO", quantity: 10 }],
    ]);
    expect(sheet?.lines[0]?.packed).not.toBeNull();
    expect(stocks.packedOf(DAY, "CRO")).toBe(70);
    expect(events.factTypes()).toEqual([
      "packing_container.opened",
      "packing_container.opened",
      "packing_container.opened",
      "packing_container.filled",
      "packing_container.filled",
      "packing_container.filled",
    ]);
  });

  it("ne place que ce qui est sorti du four : le reste reste à répartir, dans des bacs déjà là", async () => {
    const { apply, sheets, stocks } = setup(40);

    await apply.execute(COMMAND);

    const sheet = sheets.of(DAY, "ord_1");
    expect(sheet?.containerList.map((container) => container.lines)).toEqual([
      [{ sku: "CRO", quantity: 30 }],
      [{ sku: "CRO", quantity: 10 }],
      [],
    ]);
    expect(sheet?.lines[0]?.packed).toBeNull();
    expect(stocks.packedOf(DAY, "CRO")).toBe(40);
  });

  it("refuse sur une commande qui a déjà un contenant, sans rien déclarer", async () => {
    const { apply, open, desk } = setup();
    await open.execute(
      new OpenPackingContainerCommand(
        DAY,
        "ord_1",
        { nature: "bin", binTypeId: "t_m", half: false, innerBags: 0 },
        STAFF,
      ),
    );

    await expect(apply.execute(COMMAND)).rejects.toThrow(ProposalOverContainersError);
    expect(desk.declared).toHaveLength(1);
  });

  it("refuse une proposition vide, en renvoyant aux contenances", async () => {
    const { apply, desk, sheets } = setup();
    desk.proposedBins = [];

    await expect(apply.execute(COMMAND)).rejects.toThrow(EmptyProposalError);
    expect(sheets.of(DAY, "ord_1")?.containerList).toEqual([]);
  });

  it("remonte le refus de la livraison tel quel, et rien n'est écrit", async () => {
    const { apply, desk, sheets, stocks } = setup();
    desk.refusal = new RoundDeparted();

    await expect(apply.execute(COMMAND)).rejects.toThrow(RoundDeparted);
    expect(sheets.of(DAY, "ord_1")?.containerList).toEqual([]);
    expect(stocks.packedOf(DAY, "CRO")).toBe(0);
  });
});

/**
 * Régression (P6 de `pricing/plan-vente-au-poids.md`) : la proposition coupait
 * un lot au poids entre deux bacs, et le colisage refusait alors la seconde
 * part (`WeightLotSplitError`, 400) — « Proposer » échouait en entier.
 * Un bac M tient 2 000 g de saumon et 30 croissants.
 */
describe("ApplyPackingProposalHandler — un lot au poids ne se coupe jamais", () => {
  function weighed(sau: number, cro: number, whole: number) {
    const ctx = setup();
    const shadow = new InMemoryShadow();
    shadow.stocks.set(`${DAY}/SAU`, { received: sau, returned: 0 });
    shadow.stocks.set(`${DAY}/CRO`, { received: cro, returned: 0 });
    const sheets = new InMemorySheets();
    sheets.put({
      serviceDay: DAY,
      orderId: "ord_1",
      reference: "ORD-0001",
      packed: null,
      containers: 0,
      lines: [
        ...(cro > 0
          ? [
              {
                sku: "CRO",
                productName: "Croissant",
                quantity: cro,
                packed: null,
                saleUnit: "piece" as const,
              },
            ]
          : []),
        { sku: "SAU", productName: "Saumon", quantity: sau, packed: null, saleUnit: "weight" },
      ],
      containerMode: "listed",
      containerList: [],
      fulfillmentMethod: "delivery",
    });
    const stocks = new InMemoryStocks(shadow);
    ctx.desk.proposedBins = [
      {
        ...ENTRY,
        whole,
        half: false,
        content: [
          ...(cro > 0 ? [{ sku: "CRO", quantity: cro }] : []),
          { sku: "SAU", quantity: sau },
        ],
      },
    ];
    ctx.desk.grid = [
      { binTypeId: "t_m", sku: "CRO", units: 30 },
      { binTypeId: "t_m", sku: "SAU", units: 2000 },
    ];
    const apply = new ApplyPackingProposalHandler(
      sheets,
      stocks,
      ctx.desk,
      new FixedIdGenerator("ctn"),
      new FixedClock(new Date(0)),
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    );
    return { apply, sheets, stocks, desk: ctx.desk };
  }

  it("3 000 g pour des bacs de 2 000 g : rien n'est coupé, le lot reste à répartir, sans refus", async () => {
    const { apply, sheets, stocks, desk } = weighed(3000, 0, 2);

    await apply.execute(COMMAND);

    expect(desk.declared).toHaveLength(2);
    const sheet = sheets.of(DAY, "ord_1");
    expect(sheet?.containerList.map((container) => container.lines)).toEqual([[], []]);
    expect(stocks.packedOf(DAY, "SAU")).toBe(0);
  });

  it("un lot exactement à la capacité : un bac, le lot entier, la ligne posée", async () => {
    const { apply, sheets, stocks } = weighed(2000, 0, 1);

    await apply.execute(COMMAND);

    const sheet = sheets.of(DAY, "ord_1");
    expect(sheet?.containerList.map((container) => container.lines)).toEqual([
      [{ sku: "SAU", quantity: 2000 }],
    ]);
    expect(sheet?.lines.find((line) => line.sku === "SAU")?.packed).not.toBeNull();
    expect(stocks.packedOf(DAY, "SAU")).toBe(2000);
  });

  it("une commande mêlée : les croissants au premier bac, le lot ENTIER au second", async () => {
    const { apply, sheets } = weighed(1250, 24, 2);

    await apply.execute(COMMAND);

    expect(sheets.of(DAY, "ord_1")?.containerList.map((container) => container.lines)).toEqual([
      [{ sku: "CRO", quantity: 24 }],
      [{ sku: "SAU", quantity: 1250 }],
    ]);
  });
});

describe("GetShareableHalvesHandler — les moitiés libres, vues du poste", () => {
  it("rend les moitiés que la livraison sert, sans rien écrire", async () => {
    const { desk } = setup();
    const half = {
      binId: "b_left",
      code: "AAAAAA",
      orderId: "ord_2",
      reference: "ORD-0002",
      customerLabel: "Voisin",
      position: 2,
      binTypeId: "t_m",
      binTypeName: "Bac M",
      isotherm: false,
      freeHalf: "right" as const,
    };
    desk.halves = [half];

    const view = await new GetShareableHalvesHandler(
      desk,
      InMemoryPackingSettings.sharingOpen().reader(),
    ).execute(new GetShareableHalvesQuery("ord_1"));

    expect(view.halves).toEqual([half]);
    expect(desk.declared).toEqual([]);
  });

  it("remonte le refus de la livraison (commande hors livraison)", async () => {
    const { desk } = setup();
    desk.refusal = new RoundDeparted();

    await expect(
      new GetShareableHalvesHandler(desk, InMemoryPackingSettings.sharingOpen().reader()).execute(
        new GetShareableHalvesQuery("ord_1"),
      ),
    ).rejects.toThrow(RoundDeparted);
  });
});
