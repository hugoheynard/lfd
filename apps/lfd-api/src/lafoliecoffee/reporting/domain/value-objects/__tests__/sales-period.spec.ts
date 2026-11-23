import {
  InvertedSalesPeriodError,
  TooLongSalesPeriodError,
  UnreadableSalesPeriodDayError,
} from "../../errors/sales-period-errors.js";
import { MAX_SALES_PERIOD_DAYS, SalesPeriod } from "../sales-period.js";

describe("SalesPeriod — la période d'un export des ventes", () => {
  it("rend chaque jour de la période, bornes incluses, à travers un changement de mois", () => {
    const period = SalesPeriod.of("2026-02-27", "2026-03-02");

    expect(period.days).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("accepte une période d'un seul jour", () => {
    expect(SalesPeriod.of("2026-10-25", "2026-10-25").days).toEqual(["2026-10-25"]);
  });

  it("accepte 31 jours tout juste, à travers la bascule d'heure d'hiver", () => {
    const period = SalesPeriod.of("2026-10-01", "2026-10-31");

    expect(period.days).toHaveLength(MAX_SALES_PERIOD_DAYS);
    expect(period.days.at(-1)).toBe("2026-10-31");
  });

  it("refuse 32 jours en nommant le compte", () => {
    expect(() => SalesPeriod.of("2026-10-01", "2026-11-01")).toThrow(TooLongSalesPeriodError);
    expect(() => SalesPeriod.of("2026-10-01", "2026-11-01")).toThrow(/32 jours/u);
  });

  it("refuse une période à l'envers", () => {
    expect(() => SalesPeriod.of("2026-03-02", "2026-03-01")).toThrow(InvertedSalesPeriodError);
  });

  it.each([
    ["2026-02-30", "un jour qui n'existe pas"],
    ["2026-13-01", "un mois qui n'existe pas"],
    ["2026-3-01", "un mois sans zéro"],
    ["01/03/2026", "un jour à la française"],
    ["", "une borne vide"],
  ])("refuse « %s » (%s)", (day) => {
    expect(() => SalesPeriod.of(day, "2026-03-31")).toThrow(UnreadableSalesPeriodDayError);
    expect(() => SalesPeriod.of("2026-03-01", day)).toThrow(UnreadableSalesPeriodDayError);
  });
});
