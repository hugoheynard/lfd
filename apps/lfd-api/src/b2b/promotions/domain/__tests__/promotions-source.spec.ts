import {
  LegacyPromotionEditorClosedError,
  PromotionsNotEditableYetError,
} from "../errors/promotion-errors.js";
import {
  assertLegacyPromotionEditorOpen,
  assertPromotionsEditable,
  PROMOTIONS_SOURCES,
} from "../promotions-source.js";

describe("la bascule des éditeurs — à tout instant, un seul écrit", () => {
  it.each(PROMOTIONS_SOURCES)(
    "source %s : exactement un des deux éditeurs est ouvert",
    (source) => {
      const writes = (gesture: () => void): boolean => {
        try {
          gesture();
          return true;
        } catch {
          return false;
        }
      };
      const screen = writes(() => assertPromotionsEditable(source));
      const legacy = writes(() => assertLegacyPromotionEditorOpen(source, "price_rule"));
      expect(screen).not.toBe(legacy);
    },
  );

  it("après la bascule, les anciens éditeurs refusent en nommant l'écran Promotions", () => {
    expect(() => assertLegacyPromotionEditorOpen("promotions", "site_discount")).toThrow(
      LegacyPromotionEditorClosedError,
    );
    expect(() => assertLegacyPromotionEditorOpen("promotions", "price_rule")).toThrow(
      /écran Promotions/u,
    );
  });

  it("avant, l'écran Promotions refuse et nomme les Règles de prix", () => {
    expect(() => assertPromotionsEditable("shadow")).toThrow(PromotionsNotEditableYetError);
    expect(() => assertPromotionsEditable("legacy")).toThrow(/Règles de prix/u);
  });
});
