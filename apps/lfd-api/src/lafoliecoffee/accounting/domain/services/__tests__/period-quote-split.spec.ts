import type { InvoiceableOrder, PayerInvoicePlan } from "../monthly-invoicing.js";
import { splitForPeriodQuotes } from "../period-quote-split.js";
import type { PayerCommitmentSheet } from "../public-commitment-blocker.js";
import { frozenOrder } from "./collection-fixtures.js";

/** La mise à part des devis de période, après le plan (v5 B3, B4). */

const PLACED_AT = new Date("2026-09-15T08:00:00.000Z");
const ON_QUOTE: PayerCommitmentSheet = {
  commitmentRequired: true,
  serviceCodeRequired: false,
  timing: "on_period_quote",
};
const AT_ORDER: PayerCommitmentSheet = { ...ON_QUOTE, timing: "at_order" };

function order(id: string): InvoiceableOrder {
  return {
    orderId: id,
    orderNumber: `ORD-${id}`,
    companyId: "c",
    placedAt: PLACED_AT,
    receivedOn: "2026-09-16",
    billedCompanyId: null,
    frozen: frozenOrder(`ORD-${id}`, PLACED_AT),
    deliveryNoteNumbers: [],
    budgetCommitment: null,
  };
}

function group(payerId: string, overrides: Partial<PayerInvoicePlan> = {}): PayerInvoicePlan {
  return {
    payerId,
    means: "bank_transfer",
    mandate: null,
    budgetCommitment: null,
    billable: [order(`${payerId}-1`)],
    unbillable: [],
    ...overrides,
  };
}

describe("splitForPeriodQuotes", () => {
  it("un payeur sur devis sans numéro : en devis ; un payeur à la commande : à émettre", () => {
    const army = group("c_army");
    const school = group("c_school");

    const split = splitForPeriodQuotes(
      [army, school],
      new Map([
        ["c_army", ON_QUOTE],
        ["c_school", AT_ORDER],
      ]),
    );

    expect(split.toQuote).toEqual([army]);
    expect(split.toIssue).toEqual([school]);
  });

  it("un payeur privé (sans fiche) s'émet comme aujourd'hui", () => {
    const shop = group("c_shop");

    expect(splitForPeriodQuotes([shop], new Map())).toEqual({ toQuote: [], toIssue: [shop] });
  });

  it("un groupe qui porte déjà un numéro s'émet, même chez un payeur sur devis", () => {
    const numbered = group("c_army", {
      budgetCommitment: { number: "1300012345", serviceCode: "" },
    });

    expect(splitForPeriodQuotes([numbered], new Map([["c_army", ON_QUOTE]])).toIssue).toEqual([
      numbered,
    ]);
  });

  it("un code service sans numéro reste en devis : c'est le numéro qu'on attend", () => {
    const coded = group("c_army", { budgetCommitment: { number: "", serviceCode: "SERV-RH" } });

    expect(splitForPeriodQuotes([coded], new Map([["c_army", ON_QUOTE]])).toQuote).toEqual([coded]);
  });

  it("les non facturables restent sur le chemin d'aujourd'hui, seules (v5 B3)", () => {
    const held = order("held");
    const mixed = group("c_army", { unbillable: [held] });

    const split = splitForPeriodQuotes([mixed], new Map([["c_army", ON_QUOTE]]));

    expect(split.toQuote).toEqual([{ ...mixed, unbillable: [] }]);
    expect(split.toIssue).toEqual([{ ...mixed, billable: [] }]);
  });

  it("un bon non soldé reste hors du devis, sur le chemin d'aujourd'hui qui le bloque et le nomme", () => {
    const settled = order("settled");
    const anomaly: InvoiceableOrder = { ...order("anomaly"), settlement: "unsettled" };
    const mixed = group("c_army", { billable: [settled, anomaly] });

    const split = splitForPeriodQuotes([mixed], new Map([["c_army", ON_QUOTE]]));

    expect(split.toQuote).toEqual([{ ...mixed, billable: [settled], unbillable: [] }]);
    expect(split.toIssue).toEqual([{ ...mixed, billable: [anomaly] }]);
  });

  it("un groupe sans facturable ne fait pas de devis", () => {
    const onlyHeld = group("c_army", { billable: [], unbillable: [order("held")] });

    expect(splitForPeriodQuotes([onlyHeld], new Map([["c_army", ON_QUOTE]]))).toEqual({
      toQuote: [],
      toIssue: [onlyHeld],
    });
  });
});
