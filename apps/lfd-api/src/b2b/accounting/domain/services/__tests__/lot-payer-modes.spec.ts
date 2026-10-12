import { InvoicingCalendar } from "../invoicing-calendar.js";
import { lotPayerModes } from "../lot-payer-modes.js";
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
