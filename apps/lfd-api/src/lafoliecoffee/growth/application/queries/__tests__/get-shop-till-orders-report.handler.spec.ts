import { ShopTillOrdersReader } from "../../../domain/ports/shop-till-orders.reader.js";
import type { ShopTillOrderEntry } from "../../../domain/shop-till/shop-till-orders-report.js";
import { ShopTillOrdersReportPeriodError } from "../../../domain/errors/shop-till-orders-report-errors.js";
import { GetShopTillOrdersReportHandler } from "../get-shop-till-orders-report.handler.js";
import { GetShopTillOrdersReportQuery } from "../get-shop-till-orders-report.query.js";

/** Rend ses commandes, et retient la période demandée. */
class FixedShopTillOrders extends ShopTillOrdersReader {
  readonly asked: { readonly from: string; readonly to: string }[] = [];

  constructor(private readonly found: readonly ShopTillOrderEntry[]) {
    super();
  }

  entries(from: string, to: string): Promise<readonly ShopTillOrderEntry[]> {
    this.asked.push({ from, to });
    return Promise.resolve(this.found);
  }
}

describe("GetShopTillOrdersReportHandler", () => {
  it("lit la période demandée et range par jour et par point", async () => {
    const reader = new FixedShopTillOrders([
      {
        day: "2026-11-21",
        siteId: null,
        pickupLabel: "Boutique",
        totalCents: 1_500,
        handedOver: true,
      },
    ]);

    const view = await new GetShopTillOrdersReportHandler(reader).execute(
      new GetShopTillOrdersReportQuery("2026-11-01", "2026-11-30"),
    );

    expect(reader.asked).toEqual([{ from: "2026-11-01", to: "2026-11-30" }]);
    expect(view).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      rows: [
        {
          day: "2026-11-21",
          siteId: null,
          pickupLabel: "Boutique",
          orderedTtcCents: 1_500,
          orderedCount: 1,
          handedOverTtcCents: 1_500,
          handedOverCount: 1,
        },
      ],
    });
  });

  it("refuse une période illisible avant toute lecture", async () => {
    const reader = new FixedShopTillOrders([]);

    await expect(
      new GetShopTillOrdersReportHandler(reader).execute(
        new GetShopTillOrdersReportQuery("2026-11-30", "2026-11-01"),
      ),
    ).rejects.toThrow(ShopTillOrdersReportPeriodError);
    expect(reader.asked).toEqual([]);
  });
});
