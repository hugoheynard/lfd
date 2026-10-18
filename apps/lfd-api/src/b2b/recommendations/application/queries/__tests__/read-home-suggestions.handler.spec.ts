import { instantToLocal, type ShopItemView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
} from "../../../domain/entities/staff-suggestion-rule.js";
import { RecommendationCutoffReader } from "../../../domain/ports/recommendation-cutoff.reader.js";
import { SuggestedArticleReader } from "../../../domain/ports/suggested-article.reader.js";
import {
  croissantInput,
  InMemoryRuleReader,
  OrderReader,
  OrderSetting,
  RuleStore,
} from "../../commands/__tests__/staff-suggestion-doubles.js";
import { RecommendationFilter } from "../../services/recommendation-filter.js";
import { StaffSuggestionShowcase } from "../../services/staff-suggestion-showcase.js";
import { ReadHomeSuggestionsHandler } from "../read-home-suggestions.handler.js";
import { ReadHomeSuggestionsQuery } from "../read-home-suggestions.query.js";

const NOW = new Date("2026-10-18T08:00:00.000Z");
const TODAY = instantToLocal(NOW).day;

function served(sku: string): UnsealedCatalogItem {
  return {
    sku,
    name: sku,
    unitPriceMillicents: 100_000,
    vatRate: 5.5,
    family: null,
    allergens: null,
    orderTimeLimit: null,
  };
}

const CATALOG = new InMemoryProductCatalog(
  ["PAI-001", "TER-001", "BOI-001", "VIE-001"].map((sku) => served(sku)),
);

class NoCutoffs extends RecommendationCutoffReader {
  list() {
    return Promise.resolve([]);
  }
}

class Shelf extends SuggestedArticleReader {
  readonly asked: (string | null)[] = [];
  articles(skus: readonly string[], companyId: string | null) {
    this.asked.push(companyId);
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
    shelfId: "fam-epicerie",
    isFeatured: false,
    audience: "both",
  };
}

/** « Partout, à l'accueil : la terrine et le pain » — l'accueil n'a que ce déclencheur. */
const AT_HOME: Partial<StaffSuggestionRuleInput> = {
  trigger: { kind: "everywhere", ref: null },
  suggestedSkus: ["TER-001", "PAI-001", "BOI-001"],
  placement: "home",
  phrase: null,
};

function harness(rules: readonly [string, Partial<StaffSuggestionRuleInput>, number][]) {
  const store = new RuleStore();
  for (const [id, over, minutesAgo] of rules) {
    const declared = StaffSuggestionRule.declare(
      id,
      croissantInput(TODAY, over),
      { by: null, at: new Date(NOW.getTime() - minutesAgo * 60_000) },
      TODAY,
    );
    store.rows.set(id, declared.snapshot());
  }
  const shelf = new Shelf();
  const clock = new FixedClock(NOW);
  const handler = new ReadHomeSuggestionsHandler(
    new StaffSuggestionShowcase(
      new InMemoryRuleReader(store),
      new OrderReader(new OrderSetting()),
      new RecommendationFilter(CATALOG, new NoCutoffs(), clock),
      shelf,
      clock,
    ),
  );
  const read = (skus: readonly string[] = [], companyId: string | null = null) =>
    handler.execute(new ReadHomeSuggestionsQuery(companyId, skus, null));
  return { read, shelf };
}

describe("ReadHomeSuggestionsHandler", () => {
  it("rend les deux premiers articles décidés, au prix de la vitrine, avec leur raison", async () => {
    const { read } = harness([["01JRULE", AT_HOME, 0]]);

    expect(await read()).toEqual([
      {
        sku: "TER-001",
        item: shopItem("TER-001"),
        reason: { source: "staff", ruleId: "01jrule", phrase: null },
      },
      {
        sku: "PAI-001",
        item: shopItem("PAI-001"),
        reason: { source: "staff", ruleId: "01jrule", phrase: null },
      },
    ]);
  });

  it("ce qui est au panier cède sa place au suivant", async () => {
    const { read } = harness([["A", AT_HOME, 0]]);

    expect((await read(["TER-001"])).map(({ sku }) => sku)).toEqual(["PAI-001", "BOI-001"]);
  });

  it("une règle du panier ou de la fiche ne s'affiche jamais à l'accueil, sans lire la vitrine", async () => {
    const { read, shelf } = harness([
      ["CART", { trigger: { kind: "everywhere", ref: null }, placement: "cart" }, 0],
      ["SHEET", { trigger: { kind: "product_viewed", ref: "PAI-001" }, placement: "product" }, 0],
    ]);

    expect(await read(["VIE-001"])).toEqual([]);
    expect(shelf.asked).toEqual([]);
  });

  it("l'audience suit la société : une règle « pro » ne parle qu'au pro", async () => {
    const { read, shelf } = harness([["A", { ...AT_HOME, audience: "pro" }, 0]]);

    expect(await read()).toEqual([]);
    expect((await read([], "company-1")).map(({ sku }) => sku)).toEqual(["TER-001", "PAI-001"]);
    expect(shelf.asked).toEqual(["company-1"]);
  });
});
