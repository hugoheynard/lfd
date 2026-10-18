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
import { ReadProductSuggestionsHandler } from "../read-product-suggestions.handler.js";
import { ReadProductSuggestionsQuery } from "../read-product-suggestions.query.js";

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
  };
}

/** « Sur la fiche du pain de campagne, la terrine » — l'exemple du plan. */
const ON_BREAD: Partial<StaffSuggestionRuleInput> = {
  trigger: { kind: "product_viewed", ref: "PAI-001" },
  suggestedSkus: ["TER-001"],
  placement: "product",
  phrase: { fr: "Avec le pain, la terrine" },
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
  const handler = new ReadProductSuggestionsHandler(
    new StaffSuggestionShowcase(
      new InMemoryRuleReader(store),
      new OrderReader(new OrderSetting()),
      new RecommendationFilter(CATALOG, new NoCutoffs(), clock),
      shelf,
      clock,
    ),
  );
  const read = (viewed: string, skus: readonly string[] = [], companyId: string | null = null) =>
    handler.execute(new ReadProductSuggestionsQuery(companyId, viewed, skus, null));
  return { read, shelf };
}

describe("ReadProductSuggestionsHandler", () => {
  it("rend l'article décidé pour la fiche ouverte, au prix de la vitrine, avec sa raison", async () => {
    const { read } = harness([["01JRULE", ON_BREAD, 0]]);

    expect(await read("PAI-001")).toEqual([
      {
        sku: "TER-001",
        item: shopItem("TER-001"),
        reason: { source: "staff", ruleId: "01jrule", phrase: { fr: "Avec le pain, la terrine" } },
      },
    ]);
  });

  it("rien sur la fiche d'un autre article, sans lire la vitrine", async () => {
    const { read, shelf } = harness([["A", ON_BREAD, 0]]);

    expect(await read("VIE-001")).toEqual([]);
    expect(shelf.asked).toEqual([]);
  });

  it("une règle du panier ne s'affiche jamais sur la fiche", async () => {
    const { read } = harness([["CART", {}, 0]]);

    expect(await read("VIE-001", ["VIE-001"])).toEqual([]);
  });

  it("« partout » vaut sur toute fiche, sauf celle de l'article suggéré", async () => {
    const { read } = harness([
      [
        "A",
        {
          trigger: { kind: "everywhere", ref: null },
          suggestedSkus: ["TER-001"],
          placement: "product",
        },
        0,
      ],
    ]);

    expect((await read("PAI-001")).map(({ sku }) => sku)).toEqual(["TER-001"]);
    expect(await read("TER-001")).toEqual([]);
  });

  it("ni ce qui est au panier, et une seule place à la première règle", async () => {
    const { read } = harness([
      ["OLD", { ...ON_BREAD, suggestedSkus: ["BOI-001"] }, 5],
      ["NEW", ON_BREAD, 0],
    ]);

    expect((await read("PAI-001")).map(({ sku, reason }) => [sku, reason.ruleId])).toEqual([
      ["TER-001", "new"],
    ]);
    expect((await read("PAI-001", ["TER-001"])).map(({ sku }) => sku)).toEqual(["BOI-001"]);
  });

  it("l'audience suit la société : une règle « pro » ne parle qu'au pro", async () => {
    const { read, shelf } = harness([["A", { ...ON_BREAD, audience: "pro" }, 0]]);

    expect(await read("PAI-001")).toEqual([]);
    expect((await read("PAI-001", [], "company-1")).map(({ sku }) => sku)).toEqual(["TER-001"]);
    expect(shelf.asked).toEqual(["company-1"]);
  });
});
