import {
  BasketPromotionsWouldCombineError,
  OverlappingPromotionError,
} from "../errors/promotion-errors.js";
import { inForceAt } from "../live-promotion.js";
import type { PromotionCatalogueArticle } from "../ports/promotion-catalogue.reader.js";
import { PromotionAudienceSet } from "../promotion-audience-set.js";
import {
  assertNoOverlap,
  assertSingleBasketPromotion,
  commonPeriod,
  type PromotionRival,
} from "../promotion-overlap.js";
import { FROM, UNTIL, basketTerms, lineTerms } from "./promotion-terms.fixture.js";
import { LIVE_FROM, livePromotion } from "./live-promotion.fixture.js";

const article = (
  sku: string,
  overrides: Partial<PromotionCatalogueArticle> = {},
): PromotionCatalogueArticle => ({
  sku,
  name: `Article ${sku}`,
  productId: `prod_${sku}`,
  categoryPath: ["family_bread"],
  saleUnit: "piece",
  ...overrides,
});
const ARTICLES = [article("A"), article("B")];

const rival = (id: string, terms = lineTerms()): PromotionRival => ({ id, terms });
const audiences = (kind: "pros" | "pros_active" | "individuals" | "everyone") =>
  PromotionAudienceSet.of([{ kind }]);

describe("assertNoOverlap — ce qui se dispute et ce qui ne se dispute pas", () => {
  it("refuse deux promotions au même public, acheminement, fenêtre et article", () => {
    expect(() => assertNoOverlap(rival("new"), [rival("old")], ARTICLES)).toThrow(
      OverlappingPromotionError,
    );
  });

  it("nomme l'autre promotion, le public commun et le premier article", () => {
    expect(() => assertNoOverlap(rival("new"), [rival("old")], ARTICLES)).toThrow(
      /Promo d'automne.*tout le monde.*Article A/s,
    );
  });

  it("ne se dispute pas avec elle-même (révision)", () => {
    expect(() => assertNoOverlap(rival("same"), [rival("same")], ARTICLES)).not.toThrow();
  });

  it("accepte des publics sans feuille commune", () => {
    const left = rival("a", lineTerms({ audiences: audiences("individuals") }));
    const right = rival("b", lineTerms({ audiences: audiences("pros") }));
    expect(() => assertNoOverlap(left, [right], ARTICLES)).not.toThrow();
  });

  it("refuse pros contre pros actifs : une feuille commune", () => {
    const left = rival("a", lineTerms({ audiences: audiences("pros") }));
    const right = rival("b", lineTerms({ audiences: audiences("pros_active") }));
    expect(() => assertNoOverlap(left, [right], ARTICLES)).toThrow(OverlappingPromotionError);
  });

  it("accepte deux acheminements différents (livraison contre retrait à un point)", () => {
    const left = rival("a", lineTerms({ fulfillment: { kind: "delivery" } }));
    const right = rival("b", lineTerms({ fulfillment: { kind: "pickup" } }));
    expect(() => assertNoOverlap(left, [right], ARTICLES)).not.toThrow();
  });

  it("accepte deux points de retrait distincts, refuse le même", () => {
    const at = (pickupId: string) =>
      rival(pickupId, lineTerms({ fulfillment: { kind: "pickup_point", pickupId } }));
    expect(() => assertNoOverlap(at("pk_1"), [at("pk_2")], ARTICLES)).not.toThrow();
    expect(() => assertNoOverlap(at("pk_1"), [rival("x", at("pk_1").terms)], ARTICLES)).toThrow(
      OverlappingPromotionError,
    );
  });

  // La fin est exclue : une fenêtre qui s'ouvre le jour où l'autre se ferme
  // ne la chevauche pas ; une heure plus tôt, si.
  it("fenêtres : accolées = pas de chevauchement, une milliseconde de recouvrement = refus", () => {
    const first = rival("a", lineTerms({ validFrom: FROM, validTo: UNTIL }));
    const touching = rival("b", lineTerms({ validFrom: UNTIL, validTo: null }));
    const overlapping = rival("c", lineTerms({ validFrom: new Date(UNTIL.getTime() - 1) }));
    expect(() => assertNoOverlap(first, [touching], ARTICLES)).not.toThrow();
    expect(() => assertNoOverlap(first, [overlapping], ARTICLES)).toThrow(
      OverlappingPromotionError,
    );
  });

  it("une fenêtre sans fin chevauche toute fenêtre qui s'ouvre après elle", () => {
    const open = rival("a", lineTerms({ validFrom: FROM, validTo: null }));
    const later = rival("b", lineTerms({ validFrom: new Date(FROM.getTime() + 400 * 86_400_000) }));
    expect(() => assertNoOverlap(open, [later], ARTICLES)).toThrow(OverlappingPromotionError);
  });

  it("deux cumulables ne se disputent rien ; une cumulable contre une non cumulable, si", () => {
    const cumulative = (id: string) => rival(id, lineTerms({ cumulative: true }));
    expect(() => assertNoOverlap(cumulative("a"), [cumulative("b")], ARTICLES)).not.toThrow();
    expect(() => assertNoOverlap(cumulative("a"), [rival("b")], ARTICLES)).toThrow(
      OverlappingPromotionError,
    );
    expect(() => assertNoOverlap(rival("b"), [cumulative("a")], ARTICLES)).toThrow(
      OverlappingPromotionError,
    );
  });

  // Les couvertures se croisent par le public, mais aucun article n'est
  // couvert par les deux : pas de dispute.
  it("accepte des portées sans article commun", () => {
    const only = (sku: string, id = sku) =>
      rival(
        id,
        lineTerms({
          scope: {
            mode: "only",
            rules: [{ target: "variant", targetId: sku, eligible: true, targetRank: null }],
          },
        }),
      );
    expect(() => assertNoOverlap(only("A"), [only("B")], ARTICLES)).not.toThrow();
    expect(() => assertNoOverlap(only("A"), [only("A", "other")], ARTICLES)).toThrow(
      OverlappingPromotionError,
    );
  });

  // Au point ligne un article au poids n'est visé ni par le mode ni par une
  // famille : deux promotions « tout sauf » ne s'y disputent donc rien.
  it("au point ligne, un catalogue au poids seul n'offre aucun article commun", () => {
    const weighed = [article("W", { saleUnit: "weight" })];
    expect(() => assertNoOverlap(rival("a"), [rival("b")], weighed)).not.toThrow();
  });

  it("au point panier, l'unité de vente ne compte pas", () => {
    const weighed = [article("W", { saleUnit: "weight" })];
    expect(() =>
      assertNoOverlap(rival("a", basketTerms()), [rival("b", basketTerms())], weighed),
    ).toThrow(OverlappingPromotionError);
  });
});

describe("assertSingleBasketPromotion — une remise de panier par commande", () => {
  it("ne juge pas une promotion de ligne", () => {
    expect(() =>
      assertSingleBasketPromotion(rival("a"), [rival("b", basketTerms())]),
    ).not.toThrow();
  });

  it("refuse deux promotions de panier qu'un même acheteur peut recevoir", () => {
    expect(() =>
      assertSingleBasketPromotion(rival("a", basketTerms()), [rival("b", basketTerms())]),
    ).toThrow(BasketPromotionsWouldCombineError);
  });

  it("ne se refuse pas elle-même, et ignore une fenêtre accolée", () => {
    const candidate = rival("a", basketTerms({ validFrom: FROM, validTo: UNTIL }));
    expect(() => assertSingleBasketPromotion(candidate, [candidate])).not.toThrow();
    const after = rival("b", basketTerms({ validFrom: UNTIL }));
    expect(() => assertSingleBasketPromotion(candidate, [after])).not.toThrow();
  });

  it("accepte des acheminements qu'aucune commande ne partage", () => {
    const delivery = rival("a", basketTerms({ fulfillment: { kind: "delivery" } }));
    const pickup = rival("b", basketTerms({ fulfillment: { kind: "pickup" } }));
    expect(() => assertSingleBasketPromotion(delivery, [pickup])).not.toThrow();
  });
});

describe("commonPeriod — bornes", () => {
  it("une fenêtre de largeur nulle ne recouvre rien", () => {
    expect(
      commonPeriod({ validFrom: FROM, validTo: FROM }, { validFrom: FROM, validTo: null }),
    ).toBeNull();
  });
});

describe("inForceAt — début inclus, fin exclue", () => {
  const window = livePromotion({
    validFrom: LIVE_FROM,
    validTo: new Date(LIVE_FROM.getTime() + 1000),
  });
  const at = (ms: number) => new Date(LIVE_FROM.getTime() + ms);

  it.each<[string, number, boolean]>([
    ["la veille de l'ouverture", -1, false],
    ["l'instant d'ouverture", 0, true],
    ["la dernière milliseconde", 999, true],
    ["l'instant de fermeture", 1000, false],
  ])("%s", (_case, offset, expected) => {
    expect(inForceAt(window, at(offset))).toBe(expected);
  });

  it("sans fin, reste en vigueur très longtemps après", () => {
    expect(inForceAt(livePromotion(), at(10 * 365 * 86_400_000))).toBe(true);
  });

  it("une pause posée à l'instant même l'éteint, une pause d'une milliseconde plus tard non", () => {
    const paused = (offset: number) => livePromotion({ suspendedFrom: at(offset) });
    expect(inForceAt(paused(0), at(0))).toBe(false);
    expect(inForceAt(paused(1), at(0))).toBe(true);
  });
});
