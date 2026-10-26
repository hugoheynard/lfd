import { OrderBagLabelReader, type OrderBagLabelFacts } from "../../../channels/commerce/index.js";
import {
  OrderLabelHeadReader,
  type OrderLabelHead,
} from "../../../../production/channels/packing/index.js";
import { BagLabelsSheetNotFoundError } from "../../../domain/errors/packing-bag-label-errors.js";
import {
  PackingBoardReader,
  type BoardOrder,
  type PackingBoardDay,
} from "../../../domain/ports/packing-board.reader.js";
import { GetBagLabelsHandler } from "../get-bag-labels.handler.js";
import { GetBagLabelsQuery } from "../get-bag-labels.query.js";

// Un jour et un instant comparés à rien : jamais au mur.
const DAY = "2030-03-12";
const AT = new Date(1_000);

class FixedBoard extends PackingBoardReader {
  readonly asked: string[] = [];

  constructor(private readonly day: PackingBoardDay) {
    super();
  }

  dayOf(serviceDay: string): Promise<PackingBoardDay> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.day);
  }
}

class FixedHeads extends OrderLabelHeadReader {
  readonly asked: string[] = [];

  constructor(private readonly heads: ReadonlyMap<string, OrderLabelHead>) {
    super();
  }

  headOf(serviceDay: string, orderId: string): Promise<OrderLabelHead | null> {
    this.asked.push(`${serviceDay}/${orderId}`);
    return Promise.resolve(this.heads.get(orderId) ?? null);
  }
}

class FixedCommerce extends OrderBagLabelReader {
  constructor(private readonly facts: ReadonlyMap<string, OrderBagLabelFacts>) {
    super();
  }

  factsOf(orderId: string): Promise<OrderBagLabelFacts | null> {
    return Promise.resolve(this.facts.get(orderId) ?? null);
  }
}

const SHEET: BoardOrder = {
  orderId: "ord_1",
  rank: 1,
  reference: "ORD-0042",
  customerLabel: "Le Bistrot",
  fulfillmentMethod: "pickup",
  clientele: "public",
  siteId: "site_1",
  dueAt: null,
  drawnAt: AT,
  packed: null,
  containers: 2,
  containerMode: "listed",
  lines: [],
  containerList: [
    { id: "c1", nature: "bag", label: "Sac 1", bin: null, lines: [] },
    { id: "c2", nature: "bag", label: "Sac 2", bin: null, lines: [] },
  ],
  shortfallReportedAt: null,
};

const HEAD: OrderLabelHead = {
  fulfillmentLabel: "Retrait Adroit · particulier",
  when: "avant 10 h 00",
};

function setup(orders: readonly BoardOrder[], heads = new Map([["ord_1", HEAD]])) {
  const board = new FixedBoard({ orders, withdrawn: [], stocks: [] });
  const labelHeads = new FixedHeads(heads);
  const commerce = new FixedCommerce(
    new Map([["ord_1", { color: "#123456", handoverUrl: "https://admin.test/retrait/t" }]]),
  );
  return { board, labelHeads, handler: new GetBagLabelsHandler(board, labelHeads, commerce) };
}

describe("GetBagLabelsHandler", () => {
  it("assemble les sacs du poste, le titre du fournil et la couleur et le QR du commerce", async () => {
    const { board, labelHeads, handler } = setup([SHEET]);
    const view = await handler.execute(new GetBagLabelsQuery(DAY, "ord_1"));
    expect(board.asked).toEqual([DAY]);
    expect(labelHeads.asked).toEqual([`${DAY}/ord_1`]);
    expect(view).toMatchObject({
      reference: "ORD-0042",
      fulfillmentLabel: "Retrait Adroit · particulier",
      when: "avant 10 h 00",
      color: "#123456",
      handoverUrl: "https://admin.test/retrait/t",
    });
    expect(view.bags.map((bag) => `${String(bag.rank)}/${String(bag.of)}`)).toEqual(["1/2", "2/2"]);
  });

  it("refuse une commande absente du poste de ce jour", async () => {
    const { handler } = setup([]);
    await expect(handler.execute(new GetBagLabelsQuery(DAY, "ord_1"))).rejects.toBeInstanceOf(
      BagLabelsSheetNotFoundError,
    );
  });

  it("refuse une commande que le fournil n'a pas inscrite : aucun libellé deviné", async () => {
    const { handler } = setup([SHEET], new Map());
    await expect(handler.execute(new GetBagLabelsQuery(DAY, "ord_1"))).rejects.toBeInstanceOf(
      BagLabelsSheetNotFoundError,
    );
  });
});
