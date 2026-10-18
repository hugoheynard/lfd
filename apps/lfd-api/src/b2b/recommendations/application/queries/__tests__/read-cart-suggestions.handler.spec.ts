import { addDays, instantToLocal, weekdayOfDate, type ShopItemView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
} from "../../../domain/entities/staff-suggestion-rule.js";
import {
  NO_SUGGESTION_CONDITIONS,
  type SuggestionConditionsInput,
} from "../../../domain/value-objects/suggestion-conditions.js";
import { RecommendationCutoffReader } from "../../../domain/ports/recommendation-cutoff.reader.js";
import { SuggestedArticleReader } from "../../../domain/ports/suggested-article.reader.js";
import {
  croissantInput,
  InMemoryRuleReader,
  OrderReader,
  OrderSetting,
  RuleStore,
} from "../../commands/__tests__/staff-suggestion-doubles.js";
import { CatalogCartFamilyReader } from "../../../infrastructure/catalog-cart-suggestions.js";
import { RecommendationFilter } from "../../services/recommendation-filter.js";
import { StaffSuggestionShowcase } from "../../services/staff-suggestion-showcase.js";
import { ReadCartSuggestionsHandler } from "../read-cart-suggestions.handler.js";
import { ReadCartSuggestionsQuery } from "../read-cart-suggestions.query.js";

const NOW = new Date("2026-10-18T08:00:00.000Z");
const TODAY = instantToLocal(NOW).day;

/** Le catalogue servi : un café ouvert, un thé fermé pour demain matin (limite passée). */
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

const CATALOG = new InMemoryProductCatalog([
  served("VIE-001", {
    family: { id: "fam-vien", name: "Viennoiseries", position: 0, slug: "v", path: ["fam-vien"] },
  }),
  served("BOI-001"),
  served("BOI-002"),
  served("THE-001", { orderTimeLimit: { daysBefore: 1, time: "00:01", graceMinutes: 0 } }),
]);

class NoCutoffs extends RecommendationCutoffReader {
  list() {
    return Promise.resolve([]);
  }
}

/** La vitrine : chaque article à 1,23 € HT, et ce que le lecteur a demandé. */
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
    shelfId: "fam-boissons",
    isFeatured: false,
  };
}

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
  const showcase = new StaffSuggestionShowcase(
    new InMemoryRuleReader(store),
    new OrderReader(new OrderSetting()),
    new RecommendationFilter(CATALOG, new NoCutoffs(), clock),
    shelf,
    clock,
  );
  const handler = new ReadCartSuggestionsHandler(showcase, new CatalogCartFamilyReader(CATALOG));
  const read = async (skus: readonly string[], companyId: string | null = null, date?: string) =>
    handler.execute(
      new ReadCartSuggestionsQuery(
        companyId,
        skus,
        date === undefined ? null : { date, pickupAddressId: null },
      ),
    );
  /** RS8 : le jour visé avec son point de retrait (`null` = livraison), et le total lu. */
  const readWith = async (
    skus: readonly string[],
    target: { readonly pickupAddressId: string | null } | null,
    cartTotalCents: number | null,
  ) =>
    handler.execute(
      new ReadCartSuggestionsQuery(
        null,
        skus,
        target === null ? null : { date: TODAY, pickupAddressId: target.pickupAddressId },
        cartTotalCents,
      ),
    );
  return { read, readWith, shelf };
}

describe("ReadCartSuggestionsHandler", () => {
  it("rend l'article de la règle déclenchée, au prix de la vitrine, avec sa raison", async () => {
    const { read } = harness([["01JRULE", {}, 0]]);

    expect(await read(["VIE-001"])).toEqual([
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
  });

  it("rien quand le déclencheur est faux pour ce panier", async () => {
    const { read, shelf } = harness([["A", {}, 0]]);

    expect(await read(["BOI-002"])).toEqual([]);
    expect(shelf.asked).toEqual([]);
  });

  it("une famille au panier déclenche par la lignée du catalogue servi", async () => {
    const { read } = harness([
      ["A", { trigger: { kind: "category_in_cart", ref: "fam-vien" } }, 0],
    ]);

    expect((await read(["VIE-001"])).map(({ sku }) => sku)).toEqual(["BOI-001"]);
    expect(await read(["BOI-002"])).toEqual([]);
  });

  it("le filtre R4 : ni ce qui est au panier, ni l'inconnu, ni le fermé au jour visé", async () => {
    const { read } = harness([
      ["A", { suggestedSkus: ["ZZZ-404", "THE-001", "BOI-001"] }, 0],
      ["B", { suggestedSkus: ["BOI-002"] }, 5],
    ]);

    const kept = await read(["VIE-001", "BOI-001"], null, addDays(TODAY, 1));

    expect(kept.map(({ sku }) => sku)).toEqual(["BOI-002"]);
  });

  it("une seule place, à la première règle dans l'ordre réglé (la plus récente)", async () => {
    const { read } = harness([
      ["OLD", { suggestedSkus: ["BOI-002"] }, 5],
      ["NEW", { suggestedSkus: ["BOI-001"] }, 0],
    ]);

    const shown = await read(["VIE-001"]);

    expect(shown.map(({ sku, reason }) => [sku, reason.ruleId])).toEqual([["BOI-001", "new"]]);
  });

  it("l'audience suit la société : une règle « pro » ne parle qu'au pro", async () => {
    const { read, shelf } = harness([["A", { audience: "pro" }, 0]]);

    expect(await read(["VIE-001"])).toEqual([]);
    expect((await read(["VIE-001"], "company-1")).map(({ sku }) => sku)).toEqual(["BOI-001"]);
    expect(shelf.asked).toEqual(["company-1"]);
  });

  it("aucune règle : une liste vide, sans lire la vitrine", async () => {
    const { read, shelf } = harness([]);

    expect(await read(["VIE-001"])).toEqual([]);
    expect(shelf.asked).toEqual([]);
  });
});

/** Une règle « croissant au panier → café » avec ces seules conditions (RS8). */
function only(conditions: Partial<SuggestionConditionsInput>): Partial<StaffSuggestionRuleInput> {
  return { conditions: { ...NO_SUGGESTION_CONDITIONS, ...conditions } };
}

/** L'heure de `NOW` à Paris, et une plage qui la contient ou non — jamais une heure du calendrier. */
const NOW_TIME = instantToLocal(NOW).time;

describe("ReadCartSuggestionsHandler — les conditions (RS8)", () => {
  it("le jour de la semaine : affichée le jour de l'affichage, pas un autre", async () => {
    const today = weekdayOfDate(TODAY);
    const other = today === "mon" ? "tue" : "mon";
    const { read } = harness([
      ["IN", only({ weekdays: [today] }), 0],
      ["OUT", { ...only({ weekdays: [other] }), suggestedSkus: ["BOI-002"] }, 5],
    ]);

    expect((await read(["VIE-001"])).map(({ reason }) => reason.ruleId)).toEqual(["in"]);
  });

  it("la plage horaire : début compris, fin exclue, à l'heure de Paris du Clock", async () => {
    const startsNow = harness([["A", only({ hours: { from: NOW_TIME, to: "23:59" } }), 0]]);
    const endsNow = harness([["A", only({ hours: { from: "00:00", to: NOW_TIME } }), 0]]);

    expect(await startsNow.read(["VIE-001"])).toHaveLength(1);
    expect(await endsNow.read(["VIE-001"])).toEqual([]);
  });

  it("le seuil : atteint au centime près, jamais sur un panier pas encore chiffré", async () => {
    const { readWith } = harness([["A", only({ minCartTotalCents: 2_000 }), 0]]);

    expect(await readWith(["VIE-001"], null, 2_000)).toHaveLength(1);
    expect(await readWith(["VIE-001"], null, 1_999)).toEqual([]);
    expect(await readWith(["VIE-001"], null, null)).toEqual([]);
  });

  it("sans cette famille : un article de la famille (ou d'une sous-famille) au panier l'écarte", async () => {
    const { read } = harness([
      [
        "A",
        {
          ...only({ cartWithoutFamilyId: "fam-vien" }),
          trigger: { kind: "everywhere", ref: null },
        },
        0,
      ],
    ]);

    expect(await read(["VIE-001"])).toEqual([]);
    expect((await read(["BOI-002"])).map(({ sku }) => sku)).toEqual(["BOI-001"]);
  });

  it("le point de retrait : ni avant le choix, ni en livraison, ni ailleurs", async () => {
    const { readWith } = harness([["A", only({ pickupAddressIds: ["site-centre"] }), 0]]);

    expect(await readWith(["VIE-001"], null, null)).toEqual([]);
    expect(await readWith(["VIE-001"], { pickupAddressId: null }, null)).toEqual([]);
    expect(await readWith(["VIE-001"], { pickupAddressId: "site-gare" }, null)).toEqual([]);
    expect(await readWith(["VIE-001"], { pickupAddressId: "site-centre" }, null)).toHaveLength(1);
  });
});
