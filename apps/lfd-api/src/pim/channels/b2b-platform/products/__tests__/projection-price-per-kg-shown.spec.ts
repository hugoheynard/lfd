import { AllergenNaming } from "../../../../allergens/domain/services/allergen-naming.js";
import { bareVariant } from "../../../../catalogue/product/application/__tests__/audience-doubles.js";
import { projectVariant, type AllergenContext } from "../projection.js";

/**
 * **Les cases « afficher le prix au kilo », une par audience**
 * (`plan-carte-tarif.md`) : décochée, SON prix au kilo part à `null` — ce que
 * le fil dit déjà d'un kilo non saisi ; l'autre part tel que saisi.
 */
const NOTHING_ELSE: AllergenContext = { cited: [], catalogueUnion: [] };
const NAMING = AllergenNaming.from([]);
const PERCENTS = { takeaway: 5.5, eatIn: 10, b2b: 5.5 };

function project(shown: { readonly public: boolean; readonly pro: boolean }) {
  const variant = bareVariant({
    priceCents: 400,
    proPricePerKgMillicents: 650_000,
    publicPricePerKgTtcCents: 820,
    pricePerKgShownPublic: shown.public,
    pricePerKgShownPro: shown.pro,
    allergenSheet: { declared: [], mayContain: [] },
  });
  return projectVariant(variant, 303_317, 5.5, 400, PERCENTS, NAMING, NOTHING_ELSE);
}

describe("projectVariant — le prix au kilo montré ou non, par audience", () => {
  it("cochées : les deux prix au kilo partent tels que saisis", () => {
    expect(project({ public: true, pro: true })).toMatchObject({
      proPricePerKgMillicents: 650_000,
      publicPricePerKgTtcCents: 820,
    });
  });

  it("particuliers décochés : seul le public part à `null`", () => {
    expect(project({ public: false, pro: true })).toMatchObject({
      proPricePerKgMillicents: 650_000,
      publicPricePerKgTtcCents: null,
      publicTtcCents: 400,
    });
  });

  it("pros décochés : seul le pro part à `null`", () => {
    expect(project({ public: true, pro: false })).toMatchObject({
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: 820,
      priceMillicents: 303_317,
    });
  });
});
