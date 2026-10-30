import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import { guestSignInOffer } from "./basket-promotions.doubles.js";
import { catalogItem, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * « Vous avez un compte ? Connectez-vous pour profiter de −20 % » (plan des
 * promotions, § 8, lot L10) : le devis ANONYME le dit quand une promotion
 * réservée aux inscrits toucherait le panier — jamais un devis reconnu, et
 * jamais sous l'ancien chemin.
 */
const CATALOG = [catalogItem("PAI-001", "Baguette", 100_000, 5.5)];
const CLASSIFIED = {
  "PAI-001": {
    productId: "p_pain",
    categoryId: "c_pains",
    categoryPath: ["c_pains"],
    madeToOrder: false,
  },
};
const INSCRITS = livePromotion({
  id: "inscrits",
  audience: { kind: "individuals_registered" },
  validFrom: new Date(Date.UTC(2020, 0, 1)),
});
const PAYLOAD = { lines: [{ sku: "PAI-001", quantity: 2 }], fulfillment: null };

function quoting(source: "legacy" | "promotions") {
  return quotingOf({
    catalog: CATALOG,
    classified: CLASSIFIED,
    signIn: guestSignInOffer(
      source,
      { line: [INSCRITS] },
      new FixedLineClassifications(CLASSIFIED),
    ),
  });
}

describe("ShopCartQuoting — ce qu'une connexion ouvrirait (L10)", () => {
  it("le dit au devis anonyme, sans rien appliquer", async () => {
    const { view } = await quoting("promotions").quote({
      payload: PAYLOAD,
      companyId: null,
      buyerUserId: null,
    });

    expect(view.signInOffer).toEqual({ effect: { kind: "percent", basisPoints: 2_000 } });
  });

  it("ne le dit pas à un devis reconnu", async () => {
    const { view } = await quoting("promotions").quote({
      payload: PAYLOAD,
      companyId: null,
      buyerUserId: "usr_1",
    });

    expect(view).not.toHaveProperty("signInOffer");
  });

  it("ne le dit pas sous l'ancien chemin, qui ne l'appliquerait pas", async () => {
    const { view } = await quoting("legacy").quote({
      payload: PAYLOAD,
      companyId: null,
      buyerUserId: null,
    });

    expect(view).not.toHaveProperty("signInOffer");
  });
});
