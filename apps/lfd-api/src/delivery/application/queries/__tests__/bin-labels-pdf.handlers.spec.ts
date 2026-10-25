import { BinLabelColorsReader } from "../../../channels/commerce/index.js";
import { FixedBrandLogo } from "../../../../platform/brand/__tests__/fixed-brand-logo.js";
import { AppConfig } from "../../../../platform/config/app-config.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { InternalTransferNotFoundError } from "../../../domain/errors/internal-transfer-errors.js";
import { BinLabelsNothingToPrintError } from "../../../domain/errors/delivery-bin-label-errors.js";
import { BinLabelsPrint } from "../../bin-labels-print.js";
import { FixedDeliveryOrders } from "../../commands/__tests__/round-doubles.js";
import {
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
  plannedTransfer,
} from "../../__tests__/transfer-doubles.js";
import { GetOrderBinLabelsPdfHandler } from "../get-order-bin-labels-pdf.handler.js";
import { GetOrderBinLabelsPdfQuery } from "../get-order-bin-labels-pdf.query.js";
import { GetTransferBinLabelsPdfHandler } from "../get-transfer-bin-labels-pdf.handler.js";
import { GetTransferBinLabelsPdfQuery } from "../get-transfer-bin-labels-pdf.query.js";
import { FixedLoading, binRow, deliveryOrder, roundRow } from "./packing-doubles.js";

// Un instant et un jour comparés à rien : jamais au mur.
const AT = new Date(1_000);
const DAY = "2030-03-12";

/** L'origine du back-office, donnée d'avance — `null` : aucun QR. */
class AdminOrigin extends AppConfig {
  constructor(private readonly origin: string | null) {
    super();
  }

  override adminBaseUrl(): string | null {
    return this.origin;
  }
}

/** La couleur du commerce, figée ; compte les commandes demandées. */
class FixedColors extends BinLabelColorsReader {
  readonly asked: string[] = [];

  colorOf(orderId: string): Promise<string | null> {
    this.asked.push(orderId);
    return Promise.resolve("#123456");
  }
}

function printer(): BinLabelsPrint {
  return new BinLabelsPrint(
    new FixedClock(AT),
    new AdminOrigin("https://admin.test"),
    new FixedBrandLogo(),
  );
}

describe("GetOrderBinLabelsPdfHandler", () => {
  const loading = new FixedLoading([
    roundRow("r1", [
      { orderId: "ord_0" },
      {
        orderId: "ord_1",
        bins: [
          binRow("b1", "ord_1", { half: null }),
          binRow("b2", "ord_1", { half: null, voidedAt: AT }),
          binRow("b3", "ord_1", { half: null }),
        ],
      },
    ]),
  ]);
  const orders = new FixedDeliveryOrders([deliveryOrder("ord_1", "ORD-0042")]);

  it("une feuille par bac vivant, avec la tournée et l'arrêt, et la couleur lue au commerce", async () => {
    const colors = new FixedColors();
    const file = await new GetOrderBinLabelsPdfHandler(loading, orders, colors, printer()).execute(
      new GetOrderBinLabelsPdfQuery("ord_1", []),
    );
    const pages = pdfPages(file.bytes);
    expect(file.fileName).toBe("etiquettes-bacs-ORD-0042.pdf");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Camionnette 1");
    expect(pages[0]).toContain("Arrêt 2");
    expect(pages[1]).toContain("bac 2 / 2");
    expect(colors.asked).toEqual(["ord_1"]);
  });

  it("`?bacs=` n'imprime que le bac demandé ; un bac annulé n'a plus d'étiquette", async () => {
    const handler = new GetOrderBinLabelsPdfHandler(loading, orders, new FixedColors(), printer());
    const one = await handler.execute(new GetOrderBinLabelsPdfQuery("ord_1", ["b3"]));
    expect(pdfPages(one.bytes)).toHaveLength(1);
    await expect(
      handler.execute(new GetOrderBinLabelsPdfQuery("ord_1", ["b2"])),
    ).rejects.toBeInstanceOf(BinLabelsNothingToPrintError);
  });
});

describe("GetTransferBinLabelsPdfHandler", () => {
  const transfer = plannedTransfer("tr_1", DAY, AT);
  const transfers = new InternalTransfersReaderOver(new InMemoryInternalTransfers(transfer));
  const loading = new FixedLoading([
    roundRow("r1", [
      {
        orderId: "ord_x",
        bins: [
          binRow("t1", "ord_x", {
            half: null,
            owner: { kind: "transfer", transferId: "tr_1", siteLabel: "Val Village" },
          }),
        ],
      },
    ]),
  ]);

  it("titre « Transfert <site> », sans tournée ni couleur", async () => {
    const file = await new GetTransferBinLabelsPdfHandler(
      transfers,
      loading,
      new FixedDeliveryOrders(),
      printer(),
    ).execute(new GetTransferBinLabelsPdfQuery("tr_1", []));
    const pages = pdfPages(file.bytes);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("Transfert Val Village");
    expect(pages[0]).not.toContain("Arr");
  });

  it("refuse un transfert inconnu", async () => {
    await expect(
      new GetTransferBinLabelsPdfHandler(
        transfers,
        loading,
        new FixedDeliveryOrders(),
        printer(),
      ).execute(new GetTransferBinLabelsPdfQuery("tr_9", [])),
    ).rejects.toBeInstanceOf(InternalTransferNotFoundError);
  });
});
