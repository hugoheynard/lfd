import { catalogItem, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * **Le devis d'un particulier annonce ce que Stripe prélèvera** — plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 4 à § 6, lot C2).
 * Composé en TTC par la fonction même que l'agrégat rejoue à la passation.
 */
const CATALOG = [
  catalogItem("BAN-001", "Banana bread", 1_990_521, 5.5),
  catalogItem("TAS-001", "Tasse", 1_000_000, 20),
];
const PICKUP = { method: "pickup" as const, pickupAddressId: "pickup_1" };
const TEN_PERCENT = {
  adjustment: { mode: "percent" as const, bp: 1_000 },
  scope: "all_except" as const,
  categories: [],
  products: [],
};

describe("ShopCartQuoting — un particulier (exact_ht)", () => {
  it("banana bread à 21,00 € : le devis dit 21,00 €", async () => {
    const { view, voucherTotalEffectCents } = await quotingOf({ catalog: CATALOG }).quote({
      payload: { lines: [{ sku: "BAN-001", quantity: 1 }], fulfillment: null },
      companyId: null,
      buyerUserId: null,
    });

    expect(view.totalCents).toBe(2_100);
    expect(view.lines[0]).toMatchObject({ lineTotalCents: 1_990, lineTotalTtcCents: 2_100 });
    expect(view.subtotalHtCents).toBe(1_990);
    expect(view.vat).toEqual([{ rate: 5.5, amountCents: 110 }]);
    expect(voucherTotalEffectCents).toBe(0);
  });

  it("prend la remise retrait sur le TTC : −10 % de 21,00 € = 2,10 €", async () => {
    const { view } = await quotingOf({ catalog: CATALOG, b2c: TEN_PERCENT }).quote({
      payload: { lines: [{ sku: "BAN-001", quantity: 1 }], fulfillment: PICKUP },
      companyId: null,
      buyerUserId: null,
    });

    expect(view.totalCents).toBe(1_890);
    // La vue garde le sens HT de ses champs : HT + TVA font le total.
    expect(view.subtotalHtCents - view.discountCents + sumVat(view.vat)).toBe(1_890);
  });

  it("le bon retire sa valeur faciale TTC, et sa baisse de total est cette valeur", async () => {
    const { view, voucherTotalEffectCents } = await quotingOf({
      catalog: CATALOG,
      voucherCents: 500,
    }).quote({
      payload: { lines: [{ sku: "BAN-001", quantity: 1 }], fulfillment: null, voucherId: "v1" },
      companyId: null,
      buyerUserId: "user_1",
    });

    expect(view.totalCents).toBe(1_600);
    expect(voucherTotalEffectCents).toBe(500);
    expect(view.subtotalHtCents - view.voucherDiscountCents + sumVat(view.vat)).toBe(1_600);
  });

  it("convertit les frais de zone en TTC : 10,00 € HT → 12,00 €", async () => {
    const { view } = await quotingOf({
      catalog: CATALOG,
      zone: {
        id: "z1",
        postalPrefixes: ["73"],
        label: "Savoie",
        fee: { mode: "amount", cents: 1_000 },
      },
    }).quote({
      payload: {
        lines: [{ sku: "BAN-001", quantity: 1 }],
        fulfillment: { method: "delivery", codePostal: "73000" },
      },
      companyId: null,
      buyerUserId: null,
    });

    expect(view.totalCents).toBe(3_300);
    expect(view.deliveryFeeCents).toBe(1_000);
  });

  it("une société en attente, tarifée B2C, reste composée HT : la méthode suit la société", async () => {
    const { view } = await quotingOf({ catalog: CATALOG, companyStatus: "pending" }).quote({
      payload: { lines: [{ sku: "BAN-001", quantity: 1 }], fulfillment: null },
      companyId: "co_pending",
      buyerUserId: null,
    });

    expect(view.totalCents).toBe(2_101);
  });
});

function sumVat(vat: readonly { readonly amountCents: number }[]): number {
  return vat.reduce((sum, share) => sum + share.amountCents, 0);
}
