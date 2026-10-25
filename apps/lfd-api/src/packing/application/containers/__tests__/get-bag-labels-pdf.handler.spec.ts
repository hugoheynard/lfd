import { OrderBagLabelReader, type OrderBagLabelFacts } from "../../../channels/commerce/index.js";
import {
  OrderLabelHeadReader,
  type OrderLabelHead,
} from "../../../../production/channels/packing/index.js";
import { FixedBrandLogo } from "../../../../platform/brand/__tests__/fixed-brand-logo.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  BagLabelsBagNotFoundError,
  BagLabelsNoBagError,
  BagLabelsSheetNotFoundError,
} from "../../../domain/errors/packing-bag-label-errors.js";
import {
  PackingBoardReader,
  type BoardOrder,
  type PackingBoardDay,
} from "../../../domain/ports/packing-board.reader.js";
import { GetBagLabelsPdfHandler } from "../get-bag-labels-pdf.handler.js";
import { GetBagLabelsPdfQuery } from "../get-bag-labels-pdf.query.js";

// Un jour et un instant comparés à rien : jamais au mur.
const DAY = "2030-03-12";
const AT = new Date(1_000);

class FixedBoard extends PackingBoardReader {
  constructor(private readonly day: PackingBoardDay) {
    super();
  }

  dayOf(): Promise<PackingBoardDay> {
    return Promise.resolve(this.day);
  }
}

class FixedHeads extends OrderLabelHeadReader {
  constructor(private readonly head: OrderLabelHead | null) {
    super();
  }

  headOf(): Promise<OrderLabelHead | null> {
    return Promise.resolve(this.head);
  }
}

class FixedCommerce extends OrderBagLabelReader {
  factsOf(): Promise<OrderBagLabelFacts | null> {
    return Promise.resolve({ color: "#123456", handoverUrl: "https://admin.test/retrait/t" });
  }
}

function sheet(containerList: BoardOrder["containerList"]): BoardOrder {
  return {
    orderId: "ord_1",
    reference: "ORD-0042",
    customerLabel: "Le Bistrot",
    fulfillmentMethod: "pickup",
    clientele: "public",
    siteId: "site_1",
    dueAt: null,
    drawnAt: AT,
    packed: null,
    containers: containerList.length,
    containerMode: "listed",
    lines: [],
    containerList,
    shortfallReportedAt: null,
  };
}

const TWO_BAGS = sheet([
  { id: "c1", nature: "bag", label: "Sac 1", bin: null, lines: [] },
  { id: "c2", nature: "bag", label: "Sac 2", bin: null, lines: [] },
]);

const HEAD: OrderLabelHead = {
  fulfillmentLabel: "Retrait Adroit · particulier",
  when: "avant 10 h 00",
};

function handler(orders: readonly BoardOrder[], head: OrderLabelHead | null = HEAD) {
  return new GetBagLabelsPdfHandler(
    new FixedBoard({ orders, withdrawn: [], stocks: [] }),
    new FixedHeads(head),
    new FixedCommerce(),
    new FixedBrandLogo(),
    new FixedClock(AT),
  );
}

describe("GetBagLabelsPdfHandler", () => {
  it("rend une étiquette A6 par sac, nommée d'après la commande", async () => {
    const file = await handler([TWO_BAGS]).execute(new GetBagLabelsPdfQuery(DAY, "ord_1", []));
    const pages = pdfPages(file.bytes);
    expect(file.fileName).toBe("etiquettes-sacs-ORD-0042.pdf");
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain("Retrait Adroit · particulier");
    expect(pages[1]).toContain("Sac 2/2");
  });

  it("`?sacs=` n'imprime que le sac demandé", async () => {
    const file = await handler([TWO_BAGS]).execute(new GetBagLabelsPdfQuery(DAY, "ord_1", ["c2"]));
    expect(pdfPages(file.bytes)).toHaveLength(1);
  });

  it("refuse une commande absente du poste de ce jour", async () => {
    await expect(
      handler([]).execute(new GetBagLabelsPdfQuery(DAY, "ord_1", [])),
    ).rejects.toBeInstanceOf(BagLabelsSheetNotFoundError);
  });

  it("refuse une commande sans sac", async () => {
    await expect(
      handler([sheet([])]).execute(new GetBagLabelsPdfQuery(DAY, "ord_1", [])),
    ).rejects.toBeInstanceOf(BagLabelsNoBagError);
  });

  it("refuse un sac annulé depuis que l'écran l'a montré", async () => {
    await expect(
      handler([TWO_BAGS]).execute(new GetBagLabelsPdfQuery(DAY, "ord_1", ["c9"])),
    ).rejects.toBeInstanceOf(BagLabelsBagNotFoundError);
  });
});
