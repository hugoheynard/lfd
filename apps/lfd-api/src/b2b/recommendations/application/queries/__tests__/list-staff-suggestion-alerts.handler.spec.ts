import { addDays, instantToLocal, type StaffSuggestionReader } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { ShopAudience } from "../../../../catalog/domain/ports/catalog.reader.js";
import {
  ProductCatalogReader,
  type CatalogItem,
  type UnsealedCatalogItem,
} from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
} from "../../../domain/entities/staff-suggestion-rule.js";
import { NotServedCauseReader } from "../../../domain/ports/not-served-cause.reader.js";
import { RecommendationCutoffReader } from "../../../domain/ports/recommendation-cutoff.reader.js";
import type { NotServedCause } from "../../../domain/services/suggestion-alerts.js";
import {
  croissantInput,
  InMemoryRuleReader,
  KnownFamilies,
  OpenSites,
  RuleStore,
} from "../../commands/__tests__/staff-suggestion-doubles.js";
import { NO_SUGGESTION_CONDITIONS } from "../../../domain/value-objects/suggestion-conditions.js";
import { RecommendationFilter } from "../../services/recommendation-filter.js";
import { ListStaffSuggestionAlertsHandler } from "../list-staff-suggestion-alerts.handler.js";

// Comparé au `FixedClock`, jamais à l'horloge réelle.
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

/** Une limite à soixante jours : fermée sur tout l'horizon de 31 jours. */
const FAR_LIMIT = { daysBefore: 60, time: "10:00", graceMinutes: 0 };

/** Le catalogue servi, une vitrine par clientèle. */
class TwoShelves extends ProductCatalogReader {
  private readonly shelves: Record<ShopAudience, InMemoryProductCatalog>;
  constructor(pro: readonly UnsealedCatalogItem[], publicItems: readonly UnsealedCatalogItem[]) {
    super();
    this.shelves = {
      pro: new InMemoryProductCatalog(pro),
      public: new InMemoryProductCatalog(publicItems),
    };
  }
  resolve(sku: string, audience: ShopAudience): Promise<CatalogItem | null> {
    return this.shelves[audience].resolve(sku);
  }
  all(): Promise<readonly CatalogItem[]> {
    return this.shelves.pro.all();
  }
  resolveMany(skus: readonly string[], audience: ShopAudience) {
    return this.shelves[audience].resolveMany(skus);
  }
}

class NoCutoffs extends RecommendationCutoffReader {
  list() {
    return Promise.resolve([]);
  }
}

/** Les causes, déclarées par SKU ; un SKU non déclaré se lit retiré. */
class Causes extends NotServedCauseReader {
  constructor(private readonly known: Readonly<Record<string, NotServedCause>>) {
    super();
  }
  causesOf(skus: readonly string[], _audience: StaffSuggestionReader) {
    return Promise.resolve(
      new Map(skus.map((sku): [string, NotServedCause] => [sku, this.known[sku] ?? "withdrawn"])),
    );
  }
}

const PRO = [
  served("VIE-001"),
  served("BOI-001"),
  served("PAI-001"),
  served("GAL-001", { orderTimeLimit: FAR_LIMIT }),
];
const PUBLIC = [
  served("VIE-001"),
  served("PAI-001"),
  served("GAL-001", { orderTimeLimit: FAR_LIMIT }),
];

function setup(
  inputs: readonly (StaffSuggestionRuleInput & {
    readonly id: string;
    readonly active?: boolean;
    readonly archived?: boolean;
  })[],
) {
  const store = new RuleStore();
  const at = new Date(NOW.getTime() - 60_000);
  for (const { id, active = true, archived = false, ...input } of inputs) {
    const rule = StaffSuggestionRule.reconstitute({
      id,
      ...input,
      active,
      created: { by: null, at },
      lastWrite: { by: null, at },
      archivedAt: archived ? at : null,
    });
    store.rows.set(id, rule.snapshot());
  }
  const clock = new FixedClock(NOW);
  const filter = new RecommendationFilter(new TwoShelves(PRO, PUBLIC), new NoCutoffs(), clock);
  return new ListStaffSuggestionAlertsHandler(
    new InMemoryRuleReader(store),
    filter,
    new Causes({ "BOI-001": "not_for_audience", MASKED: "hidden_for_audience" }),
    new KnownFamilies(["fam-viennoiserie"]),
    new OpenSites(["site-centre"]),
    clock,
  );
}

const week = { startsOn: TODAY, endsOn: addDays(TODAY, 6) };

describe("ListStaffSuggestionAlertsHandler", () => {
  it("une règle saine n'est pas signalée", async () => {
    const view = await setup([
      { id: "OK", ...croissantInput(TODAY, { suggestedSkus: ["PAI-001"], ...week }) },
    ]).execute();
    expect(view).toEqual({ today: TODAY, rules: [] });
  });

  it("partielle : le café n'est plus servi aux particuliers, la baguette passe", async () => {
    const view = await setup([
      { id: "R", ...croissantInput(TODAY, { suggestedSkus: ["BOI-001", "PAI-001"], ...week }) },
    ]).execute();
    expect(view.rules).toEqual([
      {
        ruleId: "R",
        severity: "partial",
        triggerWithdrawn: false,
        conditions: [],
        items: [{ sku: "BOI-001", audience: "public", reason: "not_for_audience" }],
        window: { from: TODAY, to: addDays(TODAY, 6), capped: false },
      },
    ]);
  });

  it("vide : un article retiré, un masqué, une galette jamais commandable d'ici la fin", async () => {
    const view = await setup([
      {
        id: "R",
        ...croissantInput(TODAY, {
          audience: "public",
          suggestedSkus: ["GONE", "MASKED", "GAL-001"],
          endsOn: addDays(TODAY, 90),
        }),
      },
    ]).execute();
    expect(view.rules[0]).toEqual({
      ruleId: "R",
      severity: "empty",
      triggerWithdrawn: false,
      conditions: [],
      items: [
        { sku: "GONE", audience: null, reason: "withdrawn" },
        { sku: "MASKED", audience: "public", reason: "hidden_for_audience" },
        { sku: "GAL-001", audience: "public", reason: "never_orderable" },
      ],
      window: { from: TODAY, to: addDays(TODAY, 30), capped: true },
    });
  });

  it("un déclencheur sur un article ou une famille disparus : la règle ne peut plus se déclencher", async () => {
    const view = await setup([
      {
        id: "SKU",
        ...croissantInput(TODAY, {
          trigger: { kind: "product_in_cart", ref: "OLD-001" },
          suggestedSkus: ["PAI-001"],
          ...week,
        }),
      },
      {
        id: "FAM",
        ...croissantInput(TODAY, {
          trigger: { kind: "category_in_cart", ref: "fam-old" },
          suggestedSkus: ["PAI-001"],
          ...week,
        }),
      },
      {
        id: "LIVE",
        ...croissantInput(TODAY, {
          trigger: { kind: "category_in_cart", ref: "fam-viennoiserie" },
          suggestedSkus: ["PAI-001"],
          ...week,
        }),
      },
    ]).execute();
    expect(
      view.rules
        .map(({ ruleId, severity, triggerWithdrawn }) => [ruleId, severity, triggerWithdrawn])
        .sort(),
    ).toEqual([
      ["FAM", "empty", true],
      ["SKU", "empty", true],
    ]);
  });

  it("ne signale jamais une règle finie, coupée ou archivée, même vide", async () => {
    const gone = { suggestedSkus: ["GONE"] };
    const view = await setup([
      {
        id: "ENDED",
        ...croissantInput(TODAY, {
          ...gone,
          startsOn: addDays(TODAY, -9),
          endsOn: addDays(TODAY, -1),
        }),
      },
      { id: "OFF", active: false, ...croissantInput(TODAY, { ...gone, ...week }) },
      { id: "ARCH", archived: true, ...croissantInput(TODAY, { ...gone, ...week }) },
    ]).execute();
    expect(view.rules).toEqual([]);
  });

  it("une règle à venir est surveillée sur sa propre période", async () => {
    const view = await setup([
      {
        id: "LATER",
        ...croissantInput(TODAY, {
          suggestedSkus: ["GAL-001"],
          startsOn: addDays(TODAY, 3),
          endsOn: addDays(TODAY, 4),
        }),
      },
    ]).execute();
    expect(view.rules[0]?.window).toEqual({
      from: addDays(TODAY, 3),
      to: addDays(TODAY, 4),
      capped: false,
    });
    expect(view.rules[0]?.severity).toBe("empty");
  });
});

describe("ListStaffSuggestionAlertsHandler — les conditions (RS8)", () => {
  it("vide : son seul point de retrait est fermé ; partielle s'il en reste un ouvert", async () => {
    const withSites = (id: string, pickupAddressIds: readonly string[]) => ({
      id,
      ...croissantInput(TODAY, {
        suggestedSkus: ["PAI-001"],
        ...week,
        conditions: { ...NO_SUGGESTION_CONDITIONS, pickupAddressIds },
      }),
    });

    const view = await setup([
      withSites("CLOSED", ["site-ferme"]),
      withSites("HALF", ["site-centre", "site-ferme"]),
    ]).execute();

    expect(
      view.rules.map(({ ruleId, severity, conditions }) => [ruleId, severity, conditions]),
    ).toEqual([
      ["CLOSED", "empty", [{ reason: "site_closed", siteId: "site-ferme" }]],
      ["HALF", "partial", [{ reason: "site_closed", siteId: "site-ferme" }]],
    ]);
  });
});
