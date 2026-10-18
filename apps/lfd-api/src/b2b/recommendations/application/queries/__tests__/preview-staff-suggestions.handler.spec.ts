import { addDays, instantToLocal, type ShopItemView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { ShopAudience } from "../../../../catalog/domain/ports/catalog.reader.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
} from "../../../domain/entities/staff-suggestion-rule.js";
import { RecommendationCutoffReader } from "../../../domain/ports/recommendation-cutoff.reader.js";
import { SuggestedArticleReader } from "../../../domain/ports/suggested-article.reader.js";
import { CatalogCartFamilyReader } from "../../../infrastructure/catalog-cart-suggestions.js";
import {
  croissantInput,
  InMemoryRuleReader,
  OrderReader,
  OrderSetting,
  RuleStore,
} from "../../commands/__tests__/staff-suggestion-doubles.js";
import { RecommendationFilter } from "../../services/recommendation-filter.js";
import { StaffSuggestionShowcase } from "../../services/staff-suggestion-showcase.js";
import { PreviewStaffSuggestionsHandler } from "../preview-staff-suggestions.handler.js";
import {
  PreviewStaffSuggestionsQuery,
  type PreviewPlace,
} from "../preview-staff-suggestions.query.js";

const NOW = new Date("2026-10-18T08:00:00.000Z");
const TODAY = instantToLocal(NOW).day;

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

/** Le thé se commande la veille avant 00:01 : fermé pour aujourd'hui comme pour demain matin. */
const CATALOG = new InMemoryProductCatalog([
  served("VIE-001"),
  served("BOI-001"),
  served("BOI-002"),
  served("PAI-001"),
  served("THE-001", { orderTimeLimit: { daysBefore: 1, time: "00:01", graceMinutes: 0 } }),
]);

class NoCutoffs extends RecommendationCutoffReader {
  list() {
    return Promise.resolve([]);
  }
}

/** La vitrine, et qui l'a demandée : la société et l'audience. */
class Shelf extends SuggestedArticleReader {
  readonly asked: [string | null, ShopAudience][] = [];
  articles(skus: readonly string[], companyId: string | null, audience: ShopAudience) {
    this.asked.push([companyId, audience]);
    return Promise.resolve(new Map(skus.map((sku) => [sku, shopItem(sku)])));
  }
}

function shopItem(sku: string): ShopItemView {
  return {
    sku,
    name: sku,
    note: null,
    image: null,
    thumbnail: null,
    unitPriceMillicents: 123_000,
    unitPriceTtcCents: 130,
    vatRatePercent: 5.5,
    shelfId: "fam-boissons",
    isFeatured: false,
  };
}

type Seed = readonly [string, Partial<StaffSuggestionRuleInput>, number, boolean?];

function harness(rules: readonly Seed[]) {
  const store = new RuleStore();
  for (const [id, over, minutesAgo, active = true] of rules) {
    const declared = StaffSuggestionRule.declare(
      id,
      croissantInput(TODAY, { endsOn: addDays(TODAY, 7), ...over }),
      { by: null, at: new Date(NOW.getTime() - minutesAgo * 60_000) },
      TODAY,
    );
    if (!active) {
      declared.setActive(false, { by: null, at: NOW });
    }
    store.rows.set(id, declared.snapshot());
  }
  const shelf = new Shelf();
  const clock = new FixedClock(NOW);
  const showcase = new StaffSuggestionShowcase(
    new InMemoryRuleReader(store),
    new OrderReader(new OrderSetting()),
    new RecommendationFilter(CATALOG, new NoCutoffs(), clock),
    shelf,
    clock,
  );
  const handler = new PreviewStaffSuggestionsHandler(
    showcase,
    new CatalogCartFamilyReader(CATALOG),
    clock,
  );
  const preview = (
    place: PreviewPlace,
    skus: readonly string[],
    options: { audience?: "pro" | "public"; day?: string } = {},
  ) =>
    handler.execute(
      new PreviewStaffSuggestionsQuery(
        place,
        skus,
        options.audience ?? "public",
        options.day ?? null,
        null,
      ),
    );
  return { preview, shelf };
}

const CART: PreviewPlace = { placement: "cart" };
const statuses = (rules: readonly { ruleId: string; status: string }[]) =>
  rules.map(({ ruleId, status }) => [ruleId, status]);

describe("PreviewStaffSuggestionsHandler", () => {
  it("rend la carte exacte de la boutique, et « affichée » pour sa règle", async () => {
    const { preview } = harness([["01JRULE", {}, 0]]);

    const view = await preview(CART, ["VIE-001"]);

    expect(view.day).toBe(TODAY);
    expect(view.shown).toEqual([
      {
        sku: "BOI-001",
        item: shopItem("BOI-001"),
        reason: {
          source: "staff",
          ruleId: "01jrule",
          phrase: { fr: "Avec un croissant, le café" },
        },
      },
    ]);
    expect(view.rules).toEqual([
      {
        ruleId: "01JRULE",
        status: "shown",
        outrankedBy: null,
        items: [{ sku: "BOI-001", status: "shown", outrankedBy: null }],
      },
    ]);
  });

  it("nomme les portes de la règle : finie, pas commencée, coupée, clientèle, emplacement", async () => {
    const { preview } = harness([
      ["ENDED", { endsOn: TODAY }, 1],
      ["LATER", { startsOn: addDays(TODAY, 3) }, 2],
      ["OFF", {}, 3, false],
      ["PRO", { audience: "pro" }, 4],
      ["SHEET", { trigger: { kind: "everywhere", ref: null }, placement: "product" }, 5],
    ]);

    const view = await preview(CART, ["VIE-001"], { day: addDays(TODAY, 1) });

    expect(statuses(view.rules)).toEqual([
      ["ENDED", "ended"],
      ["LATER", "not_started"],
      ["OFF", "inactive"],
      ["PRO", "wrong_audience"],
      ["SHEET", "wrong_placement"],
    ]);
    expect(view.shown).toEqual([]);
  });

  it("nomme le déclencheur faux et chaque article écarté par le filtre ou la place", async () => {
    const { preview } = harness([
      ["MUTED", { trigger: { kind: "product_in_cart", ref: "PAI-001" } }, 0],
      ["WIDE", { suggestedSkus: ["ZZZ-404", "THE-001", "BOI-002"] }, 1],
      ["LATE", { suggestedSkus: ["BOI-001"] }, 2],
    ]);

    const view = await preview(CART, ["VIE-001", "BOI-002"]);

    expect(view.rules.map(({ ruleId, status, items }) => [ruleId, status, items])).toEqual([
      ["MUTED", "trigger_false", []],
      [
        "WIDE",
        "item_not_served",
        [
          { sku: "ZZZ-404", status: "item_not_served", outrankedBy: null },
          { sku: "THE-001", status: "item_not_orderable_that_day", outrankedBy: null },
          { sku: "BOI-002", status: "item_in_cart", outrankedBy: null },
        ],
      ],
      ["LATE", "shown", [{ sku: "BOI-001", status: "shown", outrankedBy: null }]],
    ]);
  });

  it("une seule place : le second article de la règle gagnante, et la règle suivante, sont battus", async () => {
    const { preview } = harness([
      ["NEW", { suggestedSkus: ["BOI-001", "BOI-002"] }, 0],
      ["OLD", { suggestedSkus: ["BOI-001"] }, 5],
    ]);

    const view = await preview(CART, ["VIE-001"]);

    expect(view.rules).toEqual([
      {
        ruleId: "NEW",
        status: "shown",
        outrankedBy: null,
        items: [
          { sku: "BOI-001", status: "shown", outrankedBy: null },
          { sku: "BOI-002", status: "outranked_by", outrankedBy: "NEW" },
        ],
      },
      {
        ruleId: "OLD",
        status: "outranked_by",
        outrankedBy: "NEW",
        items: [{ sku: "BOI-001", status: "outranked_by", outrankedBy: "NEW" }],
      },
    ]);
  });

  it("sur une fiche, l'article de la fiche n'est jamais proposé", async () => {
    const { preview } = harness([
      [
        "SHEET",
        {
          trigger: { kind: "everywhere", ref: null },
          placement: "product",
          suggestedSkus: ["PAI-001"],
        },
        0,
      ],
    ]);

    const view = await preview({ placement: "product", viewedSku: "PAI-001" }, []);

    expect(statuses(view.rules)).toEqual([["SHEET", "item_is_the_product"]]);
  });

  it("à un pro : la vitrine pro sans société, et les règles « pro » s'appliquent", async () => {
    const { preview, shelf } = harness([["PRO", { audience: "pro" }, 0]]);

    const view = await preview(CART, ["VIE-001"], { audience: "pro" });

    expect(statuses(view.rules)).toEqual([["PRO", "shown"]]);
    expect(shelf.asked).toEqual([[null, "pro"]]);
  });
});
