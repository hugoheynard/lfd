import {
  type CarrierNote,
  carrierNoteSchema,
  clientNoteSchema,
  deliveryNoteSheetSchema,
} from "../delivery-note-sheet.js";

/**
 * Le BL de transport voyage dans le carton : il ne porte aucun montant, et le
 * schéma ne laisse pas une projection qui se tromperait de lecteur lui en
 * glisser (plan E5a, § 1).
 */

const COMMON = {
  number: "BL-1042-1",
  orderId: "order_1",
  orderReference: "ORD-1042",
  orderPlacedAt: "2026-09-07T06:00:00.000Z",
  requestedFor: null,
  receivedOn: null,
  customer: { tradeName: "Trois Ponts", legalName: "SARL Trois Ponts" },
  fulfillment: {
    method: "delivery" as const,
    address: null,
    pickupLabel: null,
    window: null,
    contact: null,
    signatureRequired: true,
  },
  note: "",
  issuedAt: "2026-09-07T06:00:00.000Z",
};

const PRICED_LINE = {
  sku: "PAIN-TRAD",
  productName: "Tradition",
  quantity: 12,
  unitPriceMillicents: 120_000,
  vatRate: 5.5,
  lineTotalCents: 1_440,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
};

const MONEY = {
  subtotalCents: 1_440,
  discountCents: 0,
  discountAdjustment: null,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  vatCents: 79,
  vatShares: null,
  totalCents: 1_519,
  currency: "EUR",
  settlement: "account",
};

/** Ce que le type de transport accepte de lire — rien qui ressemble à un montant. */
type MoneyKeys = Extract<
  keyof CarrierNote | keyof CarrierNote["lines"][number],
  `${string}Cents` | `${string}Millicents` | "money" | "vatRate"
>;
const NO_MONEY_KEY: [MoneyKeys] extends [never] ? true : false = true;

describe("le BL de transport", () => {
  it("n'a aucun champ monétaire dans son type", () => {
    expect(NO_MONEY_KEY).toBe(true);
  });

  it("perd les montants qu'une projection fautive lui glisserait", () => {
    const parsed = carrierNoteSchema.parse({
      ...COMMON,
      audience: "carrier",
      lines: [PRICED_LINE],
      money: MONEY,
    });

    expect(parsed).not.toHaveProperty("money");
    expect(parsed.lines[0]).toEqual({ sku: "PAIN-TRAD", productName: "Tradition", quantity: 12 });
  });

  it("garde une ligne à zéro, que le BL recopie", () => {
    const parsed = carrierNoteSchema.parse({
      ...COMMON,
      audience: "carrier",
      lines: [{ sku: "PAIN-TRAD", productName: "Tradition", quantity: 0 }],
    });

    expect(parsed.lines[0]?.quantity).toBe(0);
  });
});

describe("le BL client", () => {
  it("porte ses montants et sa variante", () => {
    const parsed = clientNoteSchema.parse({
      ...COMMON,
      audience: "client",
      variant: "pro",
      customerPhone: null,
      lines: [PRICED_LINE],
      money: MONEY,
    });

    expect(parsed.money.totalCents).toBe(1_519);
  });

  it("est discriminé par son lecteur", () => {
    const parsed = deliveryNoteSheetSchema.parse({
      ...COMMON,
      audience: "carrier",
      lines: [{ sku: "PAIN-TRAD", productName: "Tradition", quantity: 1 }],
    });

    expect(parsed.audience).toBe("carrier");
  });
});
