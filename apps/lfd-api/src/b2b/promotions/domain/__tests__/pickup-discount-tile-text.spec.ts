import { announcedPickupDiscounts } from "../pickup-discount-announcement.js";
import { ASKED_AT, livePromotion } from "./live-promotion.fixture.js";

/**
 * **Le texte sur les vignettes dans l'annonce d'un point** (règle de Hugo,
 * 2026-11-02) : le nom réglé sur la promotion, jamais un nom fabriqué. Les
 * dates ne sont comparées qu'aux autres dates de la fixture.
 */

const AT_COEUR = livePromotion({
  id: "pd_coeur",
  fulfillment: { kind: "basket", pickup: { points: ["coeur"] }, delivery: "none" },
});

describe("announcedPickupDiscounts — le texte sur les vignettes", () => {
  it("annonce le texte réglé, repli sur le français dans les langues vides", () => {
    const worded = {
      ...AT_COEUR,
      tileText: { fr: "−20 % client Folie Coffee", en: "−20% Folie Coffee", it: null },
    };

    const announced = announcedPickupDiscounts([worded], "coeur", ASKED_AT);

    expect(announced.b2c?.tileText).toEqual({
      fr: "−20 % client Folie Coffee",
      en: "−20% Folie Coffee",
      it: "−20 % client Folie Coffee",
    });
    expect(announced.b2b?.tileText).toEqual(announced.b2c?.tileText);
  });

  it("sans texte réglé, la clé est absente : l'écran dit le libellé", () => {
    const announced = announcedPickupDiscounts([AT_COEUR], "coeur", ASKED_AT);

    expect(announced.b2c).not.toHaveProperty("tileText");
    expect(announced.b2c?.label?.fr).toBe("−20 % sur tout");
  });
});
