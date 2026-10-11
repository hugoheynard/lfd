import {
  isShopCopyPreviewScene,
  SHOP_COPY_ORDER_STEPS,
  shopCopyPreviewStepsOf,
} from "../shop-copy-preview.js";

describe("les scènes de l'aperçu : clientèle × étape", () => {
  it("les sept étapes sont les mêmes pour les trois clientèles", () => {
    expect(shopCopyPreviewStepsOf("visitor")).toEqual([...SHOP_COPY_ORDER_STEPS]);
    expect(shopCopyPreviewStepsOf("personal")).toEqual([
      ...SHOP_COPY_ORDER_STEPS,
      "orders",
      "loyalty",
    ]);
    expect(shopCopyPreviewStepsOf("pro")).toEqual([...SHOP_COPY_ORDER_STEPS, "orders", "account"]);
  });

  it("refuse une étape que la clientèle n'a pas", () => {
    expect(isShopCopyPreviewScene("visitor", "orders")).toBe(false);
    expect(isShopCopyPreviewScene("pro", "loyalty")).toBe(false);
    expect(isShopCopyPreviewScene("personal", "account")).toBe(false);
    expect(isShopCopyPreviewScene("pro", "payment")).toBe(true);
  });
});
