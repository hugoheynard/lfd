import { instantToLocal, type ProductAudienceCounterView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { StaffSuggestionRule } from "../../../domain/entities/staff-suggestion-rule.js";
import { InvalidAudiencePeriodError } from "../../../domain/errors/recommendation-errors.js";
import { StaffSuggestionCounterReader } from "../../../domain/ports/staff-suggestion-counter.reader.js";
import {
  croissantInput,
  InMemoryRuleReader,
  OrderReader,
  OrderSetting,
  RuleStore,
} from "../../commands/__tests__/staff-suggestion-doubles.js";
import { ListApplicableStaffSuggestionsHandler } from "../list-applicable-staff-suggestions.handler.js";
import { ListApplicableStaffSuggestionsQuery } from "../list-applicable-staff-suggestions.query.js";
import { ListStaffSuggestionCountersHandler } from "../list-staff-suggestion-counters.handler.js";
import { ListStaffSuggestionCountersQuery } from "../list-staff-suggestion-counters.query.js";

const NOW = new Date("2026-10-18T08:00:00.000Z");
const TODAY = instantToLocal(NOW).day;

/** Deux règles : la vieille de priorité 9, la récente de priorité 1. */
function storeOfTwo(): RuleStore {
  const store = new RuleStore();
  const older = StaffSuggestionRule.declare(
    "OLD",
    croissantInput(TODAY, { priority: 9 }),
    { by: null, at: new Date(NOW.getTime() - 60_000) },
    TODAY,
  );
  const newer = StaffSuggestionRule.declare(
    "NEW",
    croissantInput(TODAY, { priority: 1 }),
    { by: null, at: NOW },
    TODAY,
  );
  store.rows.set(older.id, older.snapshot());
  store.rows.set(newer.id, newer.snapshot());
  return store;
}

class FixedCounters extends StaffSuggestionCounterReader {
  constructor(private readonly rows: readonly ProductAudienceCounterView[]) {
    super();
  }
  between(): Promise<readonly ProductAudienceCounterView[]> {
    return Promise.resolve(this.rows);
  }
}

describe("ListApplicableStaffSuggestionsHandler", () => {
  it("suit l'ordre réglé : la plus récente, puis la priorité", async () => {
    const setting = new OrderSetting();
    const handler = new ListApplicableStaffSuggestionsHandler(
      new InMemoryRuleReader(storeOfTwo()),
      new OrderReader(setting),
      new FixedClock(NOW),
    );
    const ids = async () =>
      (await handler.execute(new ListApplicableStaffSuggestionsQuery("cart", "pro"))).map(
        (rule) => rule.id,
      );

    expect(await ids()).toEqual(["NEW", "OLD"]);
    setting.view = { order: "priority", updatedAt: NOW.toISOString() };
    expect(await ids()).toEqual(["OLD", "NEW"]);
  });
});

describe("ListStaffSuggestionCountersHandler", () => {
  const row = (over: Partial<ProductAudienceCounterView>): ProductAudienceCounterView => ({
    day: TODAY,
    sku: "BOI-001",
    event: "suggestion_shown",
    placement: "new",
    source: "staff",
    count: 1,
    ...over,
  });

  it("totalise par règle les gestes `staff` dont l'emplacement est son id en minuscules", async () => {
    const handler = new ListStaffSuggestionCountersHandler(
      new FixedCounters([
        row({ count: 5 }),
        row({ day: TODAY, sku: "BOI-002", count: 2 }),
        row({ event: "suggestion_clicked", count: 3 }),
        row({ event: "suggestion_added", count: 1 }),
        // Ni la source `data`, ni un emplacement inconnu, ni une vue directe ne comptent.
        row({ source: "data", count: 100 }),
        row({ placement: "cart", count: 100 }),
        row({ event: "product_viewed", placement: "none", source: "none", count: 100 }),
      ]),
      new InMemoryRuleReader(storeOfTwo()),
    );
    const counters = await handler.execute(new ListStaffSuggestionCountersQuery(TODAY, TODAY));
    expect(counters).toEqual([
      { ruleId: "OLD", shown: 0, clicked: 0, added: 0 },
      { ruleId: "NEW", shown: 7, clicked: 3, added: 1 },
    ]);
  });

  it("refuse une période à l'envers", async () => {
    const handler = new ListStaffSuggestionCountersHandler(
      new FixedCounters([]),
      new InMemoryRuleReader(new RuleStore()),
    );
    await expect(
      handler.execute(new ListStaffSuggestionCountersQuery("2026-10-20", "2026-10-19")),
    ).rejects.toThrow(InvalidAudiencePeriodError);
  });
});
