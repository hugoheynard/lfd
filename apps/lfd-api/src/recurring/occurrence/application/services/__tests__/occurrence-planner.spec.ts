import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { day, openBasket } from "../../../../basket/domain/entities/__tests__/basket-fixtures.js";
import { Occurrence } from "../../../domain/entities/occurrence.js";
import { InMemoryOccurrences } from "../../__tests__/recurring-doubles.js";
import { OccurrencePlanner } from "../occurrence-planner.js";

const AT = new Date(0);

function withDays(...days: readonly string[]) {
  const occurrences = new InMemoryOccurrences();
  const planned = days.map((serviceDay) =>
    Occurrence.plan({ id: serviceDay, basketId: "basket_1", serviceDay: day(serviceDay), at: AT }),
  );
  void occurrences.insertMany(planned);
  return {
    occurrences,
    planned,
    planner: new OccurrencePlanner(occurrences, new FixedIdGenerator()),
  };
}

describe("OccurrencePlanner.resume — la reprise (plan § 5)", () => {
  it("annule les échéances prévues ET refusées d'avant la reprise, garde la cause, laisse les autres", async () => {
    const { occurrences, planned, planner } = withDays("2026-11-09", "2026-11-16", "2026-11-23");
    const refused = planned[1];
    refused?.refuse("plan_closed", "Plan arrêté.", false, AT);
    if (refused !== undefined) {
      occurrences.overwrite(refused.snapshot);
    }
    const basket = openBasket({ startDate: day("2026-11-02"), endDate: day("2026-11-30") });

    await planner.resume(basket, day("2026-11-20"), AT);

    expect(occurrences.stateOn("2026-11-09")).toBe("cancelled");
    expect(occurrences.stateOn("2026-11-16")).toBe("cancelled");
    expect([...occurrences.rows.values()].find((row) => row.id === "2026-11-16")?.cause).toBe(
      "plan_closed",
    );
    expect(occurrences.stateOn("2026-11-23")).toBe("planned");
    expect(occurrences.stateOn("2026-11-30")).toBe("planned");
  });

  it("une échéance sautée avant la reprise reste sautée", async () => {
    const { occurrences, planned, planner } = withDays("2026-11-09");
    planned[0]?.skip("", AT);
    if (planned[0] !== undefined) {
      occurrences.overwrite(planned[0].snapshot);
    }

    await planner.resume(openBasket({ endDate: day("2026-11-10") }), day("2026-11-20"), AT);

    expect(occurrences.stateOn("2026-11-09")).toBe("skipped");
  });
});

describe("OccurrencePlanner.stop — l'arrêt", () => {
  it("annule toutes les échéances ouvertes, et laisse une échéance passée", async () => {
    const { occurrences, planned, planner } = withDays("2026-11-09", "2026-11-16", "2026-11-23");
    planned[0]?.place("order_1", AT);
    planned[1]?.skip("", AT);
    for (const occurrence of planned) {
      occurrences.overwrite(occurrence.snapshot);
    }

    await planner.stop(openBasket(), AT);

    expect(occurrences.stateOn("2026-11-09")).toBe("placed");
    expect(occurrences.stateOn("2026-11-16")).toBe("cancelled");
    expect(occurrences.stateOn("2026-11-23")).toBe("cancelled");
  });
});
