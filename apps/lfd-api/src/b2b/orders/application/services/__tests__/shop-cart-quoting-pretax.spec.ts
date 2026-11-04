import { orderPretaxCents } from "@lfd/money";

import { catalogItem, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * **Le devis porte ses montants lus** — plan
 * `documentation/pricing/centime-et-tva/plan-l6-montants-lus.md` (§ 3) : le
 * « Total HT » et le reliquat du bon sont calculés ici, jamais à l'écran.
 */
const CATALOG = [catalogItem("BAN-001", "Banana bread", 1_990_521, 5.5)];
const ONE_BREAD = { lines: [{ sku: "BAN-001", quantity: 1 }], fulfillment: null };

describe("ShopCartQuoting — les montants que l'écran lit (L6)", () => {
  it("le HT du devis est la règle du bon sur ses montants HT", async () => {
    const { view } = await quotingOf({ catalog: CATALOG, voucherCents: 500 }).quote({
      payload: { ...ONE_BREAD, voucherId: "v1" },
      companyId: null,
      buyerUserId: "user_1",
    });

    expect(view.pretaxCents).toBe(
      orderPretaxCents({
        subtotalCents: view.subtotalHtCents,
        discountCents: view.discountCents,
        voucherDiscountCents: view.voucherDiscountCents,
        deliveryFeeCents: view.deliveryFeeCents,
        lateFeeCents: view.lateFeeCents ?? 0,
      }),
    );
    expect(view.pretaxCents).toBeLessThan(view.subtotalHtCents);
  });

  it("sans bon, aucun reliquat", async () => {
    const { voucherRemainderCents } = await quotingOf({ catalog: CATALOG }).quote({
      payload: ONE_BREAD,
      companyId: null,
      buyerUserId: "user_1",
    });

    expect(voucherRemainderCents).toBeNull();
  });

  /**
   * Régression : l'écran soustrayait la part HT imputée de la valeur faciale
   * TTC, et un bon de 5,00 € entièrement imputé « laissait » 0,26 € (2026-11-04).
   */
  it("un bon entièrement imputé ne laisse pas de reliquat", async () => {
    const { voucherRemainderCents } = await quotingOf({
      catalog: CATALOG,
      voucherCents: 500,
    }).quote({ payload: { ...ONE_BREAD, voucherId: "v1" }, companyId: null, buyerUserId: "u" });

    expect(voucherRemainderCents).toBeNull();
  });

  it("un bon plus gros que le panier : sa valeur moins la part imputée", async () => {
    const { view, voucherRemainderCents } = await quotingOf({
      catalog: CATALOG,
      voucherCents: 5_000,
    }).quote({ payload: { ...ONE_BREAD, voucherId: "v1" }, companyId: null, buyerUserId: "u" });

    // Le panier fait 21,00 € TTC : le bon y laisse 29,00 €, en valeur faciale.
    expect(view.totalCents).toBe(0);
    expect(voucherRemainderCents).toBe(2_900);
  });
});
