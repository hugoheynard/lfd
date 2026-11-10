import { LegacyPromotionEditorClosedError } from "../errors/promotion-errors.js";
import { asPromotionsSource, refuseLegacyPromotionEditor } from "../promotions-source.js";

describe("la source des promotions, réduite à un garde-fou (L12)", () => {
  it("ne connaît plus que `promotions`", () => {
    expect(asPromotionsSource("promotions")).toBe("promotions");
  });

  it.each(["legacy", "shadow", "inconnue"])(
    "« %s » n'est plus une source : l'ancien chemin est retiré",
    (value) => {
      expect(asPromotionsSource(value)).toBeNull();
    },
  );

  it("les anciens éditeurs refusent en nommant l'écran Promotions", () => {
    expect(() => refuseLegacyPromotionEditor("site_discount")).toThrow(
      LegacyPromotionEditorClosedError,
    );
    expect(() => refuseLegacyPromotionEditor("price_rule")).toThrow(/écran Promotions/u);
  });
});
