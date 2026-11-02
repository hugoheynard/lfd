import {
  expirableOrderWhere,
  unsettledShelfOrderWhere,
  unsettledShopOrderWhere,
} from "../unsettled-shop-order.where.js";

describe("le périmètre de l'expiration", () => {
  /**
   * Complément L4 (Hugo, 2026-11-02) : une commande sur stock envoyée au lien
   * par l'équipe expire aussi. Le périmètre la laissait de côté par
   * `placedByStaffId: null`, et elle tenait la vitrine sans limite.
   */
  it("la tenue du stock admet une commande passée par l'équipe, avec une intention", () => {
    const where = unsettledShelfOrderWhere();

    expect(where).not.toHaveProperty("placedByStaffId");
    expect(where).toMatchObject({
      supply: "shelf",
      status: "placed",
      stripePaymentIntentId: { not: null },
    });
  });

  it("la boutique fabriquée reste réservée au particulier qui a passé lui-même", () => {
    expect(unsettledShopOrderWhere()).toMatchObject({ placedByStaffId: null, companyId: null });
  });

  it("l'écriture épand les deux périmètres", () => {
    expect(expirableOrderWhere()).toEqual({
      OR: [unsettledShopOrderWhere(), unsettledShelfOrderWhere()],
    });
  });
});
