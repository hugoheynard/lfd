import { InvoicingCalendar } from "../invoicing-calendar.js";
import { lotPayerModeCounts, lotPayerModes } from "../lot-payer-modes.js";
import { isPooledClosure, procedureCodeOf } from "../collection-procedure-code.js";
import { defaultModes, paris } from "./billing-mode-fixtures.js";

/**
 * Les modes des clients d'un lot (Hugo, 2026-10-12). Les dates ne se
 * comparent qu'entre elles.
 */

const calendar = InvoicingCalendar.of(defaultModes(), [
  { payerCompanyId: "c_week", segments: [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" }] },
]);

describe("lotPayerModes — les modes des clients prélevés, pas ceux qui closent", () => {
  it("le lot du lundi 5 octobre 2026 qui rattrape une facture mensuelle du 1er : les deux", () => {
    expect(
      lotPayerModes(calendar, [
        { payerCompanyId: "c_month", periodClosesAt: paris("2026-10-01") },
        { payerCompanyId: "c_week", periodClosesAt: paris("2026-10-05") },
      ]),
    ).toEqual(["monthly", "weekly"]);
  });

  it("le même lundi sans rattrapage : l'hebdomadaire seul", () => {
    expect(
      lotPayerModes(calendar, [{ payerCompanyId: "c_week", periodClosesAt: paris("2026-10-05") }]),
    ).toEqual(["weekly"]);
  });

  it("un payeur devenu hebdomadaire au 1er paie ce 1er en mensuel", () => {
    const switching = InvoicingCalendar.of(defaultModes(), [
      {
        payerCompanyId: "c_sw",
        segments: [{ effectiveFrom: paris("2026-10-01"), mode: "weekly" }],
      },
    ]);
    expect(
      lotPayerModes(switching, [{ payerCompanyId: "c_sw", periodClosesAt: paris("2026-10-01") }]),
    ).toEqual(["monthly"]);
  });

  it("un lot vide : aucun mode", () => {
    expect(lotPayerModes(calendar, [])).toEqual([]);
  });
});

describe("lotPayerModeCounts — combien de clients de chaque rythme", () => {
  it("compte chaque payeur une fois par mode", () => {
    expect(
      lotPayerModeCounts(calendar, [
        { payerCompanyId: "c_month", periodClosesAt: paris("2026-10-01") },
        { payerCompanyId: "c_other", periodClosesAt: paris("2026-10-01") },
        { payerCompanyId: "c_week", periodClosesAt: paris("2026-10-05") },
        { payerCompanyId: "c_week", periodClosesAt: paris("2026-10-05") },
      ]),
    ).toEqual([
      { mode: "monthly", count: 2 },
      { mode: "weekly", count: 1 },
    ]);
  });

  it("un lot vide : aucun compte", () => {
    expect(lotPayerModeCounts(calendar, [])).toEqual([]);
  });
});

describe("la clôture mutualisée — plusieurs rythmes closent le même jour", () => {
  it("le lundi 1er février 2027 : l'hebdomadaire et le mensuel, un seul code", () => {
    const modes = calendar.modesClosingAt(paris("2027-02-01"));
    expect(modes).toEqual(["monthly", "weekly"]);
    expect(isPooledClosure(modes)).toBe(true);
    expect(procedureCodeOf(paris("2027-02-01"), modes)).toBe("PRL-270201-HM");
  });

  it("un lundi ordinaire : l'hebdomadaire seul, pas mutualisée", () => {
    const modes = calendar.modesClosingAt(paris("2026-10-05"));
    expect(modes).toEqual(["weekly"]);
    expect(isPooledClosure(modes)).toBe(false);
  });
});
