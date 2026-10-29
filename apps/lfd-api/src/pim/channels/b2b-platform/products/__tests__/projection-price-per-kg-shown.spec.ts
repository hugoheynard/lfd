import { AllergenNaming } from "../../../../allergens/domain/services/allergen-naming.js";
import { bareVariant } from "../../../../catalogue/product/application/__tests__/audience-doubles.js";
import { projectVariant, type AllergenContext } from "../projection.js";

/**
 * **La case « afficher le prix au kilo en boutique »** (`plan-carte-tarif.md`) :
 * décochée, le fil porte `null` — ce qu'il dit déjà d'un kilo non saisi. Pas
 * de version de fil : le canal ne reçoit pas ce qu'il ne doit pas montrer.
 */
const NOTHING_ELSE: AllergenContext = { cited: [], catalogueUnion: [] };
const NAMING = AllergenNaming.from([]);
const PERCENTS = { takeaway: 5.5, eatIn: 10, b2b: 5.5 };

function project(pricePerKgShown: boolean) {
  const variant = bareVariant({
    priceCents: 400,
    proPricePerKgMillicents: 650_000,
    publicPricePerKgTtcCents: 820,
    pricePerKgShown,
    allergenSheet: { declared: [], mayContain: [] },
  });
  return projectVariant(variant, 303_317, 5.5, 400, PERCENTS, NAMING, NOTHING_ELSE);
}

describe("projectVariant — le prix au kilo montré ou non", () => {
  it("cochée : les deux prix au kilo partent tels que saisis", () => {
    expect(project(true)).toMatchObject({
      proPricePerKgMillicents: 650_000,
      publicPricePerKgTtcCents: 820,
    });
  });

  it("décochée : les deux partent à `null`, le prix à la pièce reste", () => {
    expect(project(false)).toMatchObject({
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: null,
      publicTtcCents: 400,
      priceMillicents: 303_317,
    });
  });
});
