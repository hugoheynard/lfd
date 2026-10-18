import { instantToLocal, type ShopItemView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import {
  PurchaseHistoryReader,
  type PurchaseHistoryAsk,
} from "../../../domain/ports/purchase-history.reader.js";
import { RecommendationCutoffReader } from "../../../domain/ports/recommendation-cutoff.reader.js";
import { SuggestedArticleReader } from "../../../domain/ports/suggested-article.reader.js";
import { USUALS_PLACES, type PurchasedSku } from "../../../domain/services/usuals.js";
import { RecommendationFilter } from "../../services/recommendation-filter.js";
import { ListMyUsualsHandler } from "../list-my-usuals.handler.js";
import { ListMyUsualsQuery } from "../list-my-usuals.query.js";

const NOW = new Date("2026-10-18T08:00:00.000Z");
const TODAY = instantToLocal(NOW).day;
/** Trois mardis : de quoi faire un rythme. Comparés entre eux seulement. */
const TUESDAYS = ["2026-09-01", "2026-09-08", "2026-09-15"] as const;

function served(sku: string, over: Partial<UnsealedCatalogItem> = {}): UnsealedCatalogItem {
  return {
    sku,
    name: sku,
    unitPriceMillicents: 100_000,
    vatRate: 5.5,
    family: null,
    allergens: null,
    orderTimeLimit: null,
    ...over,
  };
}

const MANY = Array.from({ length: USUALS_PLACES + 3 }, (_, index) => `PAI-${String(index)}`);

const CATALOG = new InMemoryProductCatalog([
  served("VIE-001"),
  served("BOI-001"),
  // Fermé pour aujourd'hui : la limite est la veille.
  served("THE-001", { orderTimeLimit: { daysBefore: 1, time: "00:01", graceMinutes: 0 } }),
  ...MANY.map((sku) => served(sku)),
]);

class NoCutoffs extends RecommendationCutoffReader {
  list() {
    return Promise.resolve([]);
  }
}

/** La vitrine : chaque article servi, et pour quelle société on l'a demandé. */
class Shelf extends SuggestedArticleReader {
  readonly asked: { companyId: string | null; audience: string }[] = [];
  constructor(private readonly hidden: ReadonlySet<string> = new Set()) {
    super();
  }
  articles(skus: readonly string[], companyId: string | null, audience: "pro" | "public") {
    this.asked.push({ companyId, audience });
    const shown = skus.filter((sku) => !this.hidden.has(sku));
    return Promise.resolve(new Map(shown.map((sku): [string, ShopItemView] => [sku, item(sku)])));
  }
}

/** L'historique par société : le double rend celui de la société demandée, et rien d'autre. */
class Histories extends PurchaseHistoryReader {
  readonly asked: PurchaseHistoryAsk[] = [];
  constructor(private readonly byCompany: ReadonlyMap<string, readonly PurchasedSku[]>) {
    super();
  }
  ofCompany(ask: PurchaseHistoryAsk) {
    this.asked.push(ask);
    return Promise.resolve(this.byCompany.get(ask.companyId) ?? []);
  }
}

function item(sku: string): ShopItemView {
  return {
    sku,
    name: sku,
    note: null,
    image: null,
    thumbnail: null,
    unitPriceMillicents: 123_000,
    unitPriceTtcCents: 130,
    vatRatePercent: 5.5,
    shelfId: "fam-pains",
    isFeatured: false,
    audience: "both",
  };
}

function harness(history: Record<string, readonly PurchasedSku[]>, hidden: readonly string[] = []) {
  const clock = new FixedClock(NOW);
  const histories = new Histories(new Map(Object.entries(history)));
  const shelf = new Shelf(new Set(hidden));
  const handler = new ListMyUsualsHandler(
    histories,
    new RecommendationFilter(CATALOG, new NoCutoffs(), clock),
    shelf,
    clock,
  );
  const read = (companyId: string | null, skus: readonly string[] = [], date?: string) =>
    handler.execute(
      new ListMyUsualsQuery(
        companyId,
        skus,
        date === undefined ? null : { date, pickupAddressId: null },
      ),
    );
  return { histories, shelf, read };
}

describe("ListMyUsualsHandler — « vos habituels »", () => {
  it("ne lit rien et ne rend rien sans société : un particulier n'a pas d'habituels (R3 attend le cabinet)", async () => {
    const { histories, read } = harness({ co_a: [{ sku: "VIE-001", days: TUESDAYS }] });
    expect(await read(null)).toEqual([]);
    expect(histories.asked).toEqual([]);
  });

  it("lit l'historique de la SEULE société de l'espace, sur douze mois", async () => {
    const { histories, shelf, read } = harness({ co_a: [{ sku: "VIE-001", days: TUESDAYS }] });
    const shown = await read("co_a");
    expect(histories.asked).toEqual([{ companyId: "co_a", since: "2025-10-18" }]);
    expect(shown).toEqual([
      {
        sku: "VIE-001",
        item: item("VIE-001"),
        reason: { source: "data", kind: "weekly_rhythm", weekday: "tue" },
      },
    ]);
    expect(shelf.asked).toEqual([{ companyId: "co_a", audience: "pro" }]);
  });

  it("ne rend rien d'une autre société", async () => {
    const { read } = harness({ co_a: [{ sku: "VIE-001", days: TUESDAYS }] });
    expect(await read("co_b")).toEqual([]);
  });

  it("dit « commandé N fois » quand aucun jour ne revient assez", async () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
    const { read } = harness({ co_a: [{ sku: "BOI-001", days }] });
    expect((await read("co_a"))[0]?.reason).toEqual({
      source: "data",
      kind: "frequent",
      orderCount: 4,
    });
  });

  it("écarte ce qui n'est pas servi, pas commandable au jour visé, ou déjà au panier", async () => {
    const { read } = harness({
      co_a: [
        { sku: "VIE-001", days: TUESDAYS },
        { sku: "BOI-001", days: TUESDAYS },
        { sku: "THE-001", days: TUESDAYS },
        { sku: "RETIRE-001", days: TUESDAYS },
      ],
    });
    const shown = await read("co_a", ["VIE-001"], TODAY);
    expect(shown.map((view) => view.sku)).toEqual(["BOI-001"]);
  });

  it("cède la place d'un article que la vitrine ne montre pas, sans le remplacer par un inventé", async () => {
    const { read } = harness({ co_a: [{ sku: "VIE-001", days: TUESDAYS }] }, ["VIE-001"]);
    expect(await read("co_a")).toEqual([]);
  });

  it(`montre ${USUALS_PLACES} habituels au plus`, async () => {
    const { read } = harness({ co_a: MANY.map((sku) => ({ sku, days: TUESDAYS })) });
    expect(await read("co_a")).toHaveLength(USUALS_PLACES);
  });
});
