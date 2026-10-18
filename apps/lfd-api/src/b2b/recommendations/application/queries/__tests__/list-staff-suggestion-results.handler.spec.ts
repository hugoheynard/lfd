import { addDays, instantToLocal, type ProductAudienceCounterView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { StaffSuggestionRule } from "../../../domain/entities/staff-suggestion-rule.js";
import { StaffSuggestionCounterReader } from "../../../domain/ports/staff-suggestion-counter.reader.js";
import { SuggestedSkuSalesReader } from "../../../domain/ports/suggested-sku-sales.reader.js";
import type { SkuDaySales } from "../../../domain/services/suggestion-attribution.js";
import {
  croissantInput,
  InMemoryRuleReader,
  RuleStore,
} from "../../commands/__tests__/staff-suggestion-doubles.js";
import { ListStaffSuggestionResultsHandler } from "../list-staff-suggestion-results.handler.js";
import { ListStaffSuggestionResultsQuery } from "../list-staff-suggestion-results.query.js";

const NOW = new Date("2026-10-18T08:00:00.000Z");
const TODAY = instantToLocal(NOW).day;

class FixedCounters extends StaffSuggestionCounterReader {
  readonly asked: { from: string; to: string }[] = [];
  constructor(private readonly rows: readonly ProductAudienceCounterView[]) {
    super();
  }
  between(from: string, to: string): Promise<readonly ProductAudienceCounterView[]> {
    this.asked.push({ from, to });
    return Promise.resolve(this.rows);
  }
}

class FixedSales extends SuggestedSkuSalesReader {
  readonly asked: (readonly string[])[] = [];
  constructor(private readonly rows: readonly SkuDaySales[]) {
    super();
  }
  dailySales(_from: string, _to: string, skus: readonly string[]): Promise<readonly SkuDaySales[]> {
    this.asked.push(skus);
    return Promise.resolve(this.rows);
  }
}

function oneRule(): RuleStore {
  const store = new RuleStore();
  const rule = StaffSuggestionRule.declare(
    "R1",
    croissantInput(TODAY),
    { by: null, at: NOW },
    TODAY,
  );
  store.rows.set(rule.id, rule.snapshot());
  return store;
}

const counter = (over: Partial<ProductAudienceCounterView>): ProductAudienceCounterView => ({
  day: TODAY,
  sku: "PAI-001",
  event: "suggestion_shown",
  placement: "r1",
  source: "staff",
  count: 1,
  ...over,
});

describe("ListStaffSuggestionResultsHandler", () => {
  it("compte, estime les commandées au plafond des ajouts, et le CA au prix HT moyen", async () => {
    const counters = new FixedCounters([
      counter({ count: 8 }),
      counter({ event: "suggestion_clicked", count: 3 }),
      counter({ event: "suggestion_added", count: 2 }),
    ]);
    const sales = new FixedSales([{ day: TODAY, sku: "PAI-001", quantity: 5, revenueCents: 600 }]);
    const handler = new ListStaffSuggestionResultsHandler(
      counters,
      new InMemoryRuleReader(oneRule()),
      sales,
      new FixedClock(NOW),
    );

    const view = await handler.execute(new ListStaffSuggestionResultsQuery(30));

    expect(view).toEqual({
      days: 30,
      from: addDays(TODAY, -29),
      to: TODAY,
      rules: [
        {
          ruleId: "R1",
          shown: 8,
          clicked: 3,
          added: 2,
          orderedEstimate: 2,
          addRateBasisPoints: 2500,
          revenueEstimateCents: 240,
        },
      ],
    });
    expect(counters.asked).toEqual([{ from: addDays(TODAY, -29), to: TODAY }]);
    expect(sales.asked).toEqual([["PAI-001"]]);
  });

  it("sans ajout, ne lit pas les ventes et rend des zéros, sans taux sans affichage", async () => {
    const sales = new FixedSales([]);
    const handler = new ListStaffSuggestionResultsHandler(
      new FixedCounters([]),
      new InMemoryRuleReader(oneRule()),
      sales,
      new FixedClock(NOW),
    );

    const view = await handler.execute(new ListStaffSuggestionResultsQuery(7));

    expect(view.from).toBe(addDays(TODAY, -6));
    expect(view.rules).toEqual([
      {
        ruleId: "R1",
        shown: 0,
        clicked: 0,
        added: 0,
        orderedEstimate: 0,
        addRateBasisPoints: null,
        revenueEstimateCents: 0,
      },
    ]);
    expect(sales.asked).toEqual([]);
  });
});
