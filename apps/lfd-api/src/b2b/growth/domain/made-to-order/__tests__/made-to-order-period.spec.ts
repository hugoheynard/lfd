import { MadeToOrderReportPeriodError } from "../../errors/made-to-order-report-errors.js";
import { MadeToOrderPeriod, monthsEndingAt } from "../made-to-order-period.js";

describe("MadeToOrderPeriod", () => {
  it("garde deux jours bornes comprises", () => {
    const period = MadeToOrderPeriod.of("2026-01-01", "2026-01-31", 366);
    expect([period.from, period.to]).toEqual(["2026-01-01", "2026-01-31"]);
  });

  it("accepte un seul jour", () => {
    expect(MadeToOrderPeriod.of("2026-03-05", "2026-03-05", 366).to).toBe("2026-03-05");
  });

  it("refuse un jour qui n'existe pas plutôt que de glisser au mois suivant", () => {
    expect(() => MadeToOrderPeriod.of("2026-02-31", "2026-03-10", 366)).toThrow(
      MadeToOrderReportPeriodError,
    );
  });

  it("refuse une fin avant le début", () => {
    expect(() => MadeToOrderPeriod.of("2026-03-10", "2026-03-09", 366)).toThrow(/inversez/u);
  });

  it("refuse une période plus longue que la borne, et accepte la borne exacte", () => {
    expect(() => MadeToOrderPeriod.of("2025-01-01", "2026-01-02", 366)).toThrow(/366 jours/u);
    expect(MadeToOrderPeriod.of("2025-01-01", "2026-01-01", 366).to).toBe("2026-01-01");
  });
});

describe("monthsEndingAt", () => {
  it("rend les mois du plus ancien au plus récent, à travers l'année", () => {
    expect(monthsEndingAt("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("rend le seul mois demandé", () => {
    expect(monthsEndingAt("2026-10", 1)).toEqual(["2026-10"]);
  });
});
