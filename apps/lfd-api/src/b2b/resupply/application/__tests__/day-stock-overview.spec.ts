import { FixedClosedPlans } from "../../../orders/application/commands/__tests__/plan-doubles.js";
import { DayStockReader, type DayStockSite } from "../../domain/day-stock.reader.js";
import type { ResupplyReceiptSnapshot } from "../../domain/resupply-receipt.js";
import {
  isPlaced,
  type PlacedSiteResupplySnapshot,
  type SiteResupplySnapshot,
} from "../../domain/site-resupply.js";
import { StockAlert } from "../../domain/stock-alert.js";
import { GetDayStockOverviewHandler } from "../get-day-stock-overview.handler.js";
import { GetDayStockOverviewQuery } from "../get-day-stock-overview.query.js";
import { ReceiveSiteResupplyCommand } from "../receive-site-resupply.command.js";
import { AT, AUTHOR, CRO_24, DAY, OTHER, placed, setup, SITE } from "./resupply-receipt-setup.js";
import type { InMemoryReceipts } from "./resupply-doubles.js";
import { type InMemorySiteResupplies, SiteLabels } from "./site-resupply-doubles.js";
import { InMemoryStockAlertReader } from "./stock-alert-doubles.js";

const ARCHIVED = "site_old";

/** Le lecteur de l'onglet sur les mêmes stockages : tous points, la journée seule. */
class InMemoryDayStockReader extends DayStockReader {
  constructor(
    private readonly listed: readonly DayStockSite[],
    private readonly resupplies: InMemorySiteResupplies,
    private readonly receipts: InMemoryReceipts,
  ) {
    super();
  }

  sites(): Promise<readonly DayStockSite[]> {
    return Promise.resolve(this.listed);
  }

  resuppliesOn(day: string): Promise<readonly PlacedSiteResupplySnapshot[]> {
    return Promise.resolve(
      this.resupplies
        .all()
        .filter(isPlaced)
        .filter((row) => row.serviceDay === day),
    );
  }

  receiptsOn(day: string): Promise<readonly ResupplyReceiptSnapshot[]> {
    return Promise.resolve(this.receipts.all().filter((row) => row.serviceDay === day));
  }
}

/**
 * Le Village : un réassort réceptionné (CRO), un « pour demain » emballé
 * (PAC, 6 demandés, 5 emballés), un arrivé (BAG), un annulé ; une rupture sur
 * TAR. Le Labo : rien. Un point archivé : une alerte seule.
 */
async function world(stopped: readonly string[], extra: readonly SiteResupplySnapshot[] = []) {
  const bench = setup();
  extra.forEach((resupply) => bench.resupplies.put(resupply));
  bench.resupplies.put(placed("r_cro", CRO_24));
  bench.resupplies.put(
    placed("r_pac", [{ sku: "PAC", label: "Pain au chocolat", quantity: 6 }], {
      target: "tomorrow",
      origin: "bakehouse",
      name: "Vitrine du matin",
    }),
  );
  bench.resupplies.put(
    placed("r_bag", [{ sku: "BAG", label: "Baguette", quantity: 3 }], {
      arrived: { at: AT, author: AUTHOR },
    }),
  );
  bench.resupplies.put(
    placed("r_off", [{ sku: "FLA", label: "Flan", quantity: 2 }], {
      cancelled: { at: AT, author: AUTHOR },
    }),
  );
  bench.packed.closed.set("r_pac", new Map([["PAC", 5]]));
  await bench.receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "r_cro", "s"));
  const alert = (id: string, siteId: string) =>
    StockAlert.declare({
      id,
      siteId,
      sku: "TAR",
      label: "Tartelette",
      level: "out_of_stock",
      trace: { at: AT, author: AUTHOR },
    });
  await bench.alerts.save(alert("a_tar", SITE));
  await bench.alerts.save(alert("a_old", ARCHIVED));
  const handler = new GetDayStockOverviewHandler(
    new InMemoryDayStockReader(
      [
        { id: SITE, label: "Village" },
        { id: OTHER, label: "Labo" },
      ],
      bench.resupplies,
      bench.receipts,
    ),
    new InMemoryStockAlertReader(bench.alerts),
    new FixedClosedPlans(stopped),
    bench.packed,
    new SiteLabels(new Map([[ARCHIVED, "Ancien kiosque"]])),
  );
  return handler.execute(new GetDayStockOverviewQuery(DAY));
}

describe("l'onglet Stock de la Supervision (S1)", () => {
  it("rend chaque point dans l'ordre, ses réassorts et leur état, sans l'annulé non reçu", async () => {
    const view = await world([DAY]);

    expect(view.serviceDay).toBe(DAY);
    expect(view.sites.map((site) => site.siteLabel)).toEqual(["Village", "Labo", "Ancien kiosque"]);
    expect(view.sites[0]?.resupplies).toEqual([
      expect.objectContaining({ resupplyId: "r_cro", state: "received", pieces: 24 }),
      expect.objectContaining({
        resupplyId: "r_pac",
        state: "frozen",
        name: "Vitrine du matin",
        origin: "bakehouse",
        target: "tomorrow",
      }),
      expect.objectContaining({ resupplyId: "r_bag", state: "arrived" }),
    ]);
  });

  it("trie les produits : alertes, puis attendus (l'emballé l'emporte), puis le stock", async () => {
    const view = await world([DAY]);

    expect(view.sites[0]?.products).toEqual([
      { sku: "TAR", label: "Tartelette", stock: 0, alert: "out_of_stock", expected: 0 },
      { sku: "BAG", label: "Baguette", stock: 0, alert: null, expected: 3 },
      { sku: "PAC", label: "Pain au chocolat", stock: 0, alert: null, expected: 5 },
      { sku: "CRO", label: "Croissant", stock: 24, alert: null, expected: 0 },
    ]);
  });

  it("garde un point sans rien, et ne fige pas un « pour demain » tant que le plan est ouvert", async () => {
    const view = await world([]);

    expect(view.sites[1]).toEqual({
      siteId: OTHER,
      siteLabel: "Labo",
      resupplies: [],
      products: [],
    });
    expect(view.sites[0]?.resupplies[1]).toMatchObject({ resupplyId: "r_pac", state: "sent" });
  });

  /** R4d : un « au plus tôt » lancé, puis parti, se lit sous son état le plus avancé. */
  it("dit « lancé » puis « parti », et « arrivé » l'emporte sur « parti »", async () => {
    const launched = { at: AT, byName: "Paul" };
    const departed = { at: AT, byName: "Léa" };
    const line = [{ sku: "ECL", label: "Éclair", quantity: 2 }];
    const view = await world(
      [DAY],
      [
        placed("r_lau", line, { launched }),
        placed("r_dep", line, { launched, departed }),
        placed("r_arr", line, { launched, departed, arrived: { at: AT, author: AUTHOR } }),
      ],
    );

    const states = new Map(
      (view.sites[0]?.resupplies ?? []).map((resupply) => [resupply.resupplyId, resupply.state]),
    );
    expect(states.get("r_lau")).toBe("launched");
    expect(states.get("r_dep")).toBe("departed");
    expect(states.get("r_arr")).toBe("arrived");
  });
});
