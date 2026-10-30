import { announcedPickupDiscounts } from "../pickup-discount-announcement.js";
import { ASKED_AT, LIVE_FROM, livePromotion } from "./live-promotion.fixture.js";

/** « −20 % retrait à Cœur de station, pros actifs » : la reprise d'une remise de site. */
const PROS_AT_COEUR = livePromotion({
  id: "pd_coeur_b2b",
  audience: { kind: "pros_active" },
  fulfillment: { kind: "pickup_point", pickupId: "coeur" },
  scope: {
    mode: "all_except",
    rules: [
      { target: "category", targetId: "c_boissons", eligible: false, targetRank: null },
      { target: "product", targetId: "p_eau", eligible: true, targetRank: null },
    ],
  },
});

const PUBLIC_AT_COEUR = livePromotion({
  id: "pd_coeur_b2c",
  effect: { kind: "basket_amount_off", cents: 300 },
  audience: { kind: "everyone_but_active_pros" },
  fulfillment: { kind: "pickup_point", pickupId: "coeur" },
});

/** Le libellé commun des fixtures, sans traduction : le français dans les trois langues. */
const SAME_EVERYWHERE = { fr: "−20 % sur tout", en: "−20 % sur tout", it: "−20 % sur tout" };

describe("announcedPickupDiscounts — l'annonce d'un point, tirée des promotions", () => {
  it("annonce la remise des pros et celle des particuliers, portée comprise", () => {
    expect(announcedPickupDiscounts([PROS_AT_COEUR, PUBLIC_AT_COEUR], "coeur", ASKED_AT)).toEqual({
      b2b: {
        adjustment: { mode: "percent", bp: 2000 },
        label: SAME_EVERYWHERE,
        scope: "all_except",
        categories: [{ categoryId: "c_boissons", eligible: false }],
        products: [{ productId: "p_eau", eligible: true }],
      },
      b2c: {
        adjustment: { mode: "amount", cents: 300 },
        label: SAME_EVERYWHERE,
        scope: "all_except",
        categories: [],
        products: [],
      },
    });
  });

  it("n'annonce rien à un autre point, ni une promotion de ligne", () => {
    const line = livePromotion({ id: "line" });
    expect(announcedPickupDiscounts([PROS_AT_COEUR, line], "autre", ASKED_AT)).toEqual({
      b2b: null,
      b2c: null,
    });
  });

  it("une promotion « tous les retraits » s'annonce à chaque point, aux deux clientèles", () => {
    const everywhere = livePromotion({ id: "all", fulfillment: { kind: "pickup" } });
    const announced = announcedPickupDiscounts([everywhere], "autre", ASKED_AT);
    expect(announced.b2b?.adjustment).toEqual({ mode: "percent", bp: 2000 });
    expect(announced.b2c?.adjustment).toEqual({ mode: "percent", bp: 2000 });
  });

  it("le point précis l'emporte sur « tous les retraits », comme à la caisse", () => {
    const everywhere = livePromotion({
      id: "a_all",
      effect: { kind: "percent_off", basisPoints: 5000 },
      fulfillment: { kind: "pickup" },
      audience: { kind: "pros_active" },
    });
    expect(
      announcedPickupDiscounts([everywhere, PROS_AT_COEUR], "coeur", ASKED_AT).b2b?.adjustment,
    ).toEqual({ mode: "percent", bp: 2000 });
  });

  it("hors fenêtre ou en pause, elle ne s'annonce pas", () => {
    const later = { ...PROS_AT_COEUR, validFrom: new Date(ASKED_AT.getTime() + 1) };
    const paused = { ...PROS_AT_COEUR, suspendedFrom: LIVE_FROM };
    expect(announcedPickupDiscounts([later, paused], "coeur", ASKED_AT).b2b).toBeNull();
  });

  it("une société nommée ne s'annonce pas : le contrat ne la porte pas", () => {
    const company = livePromotion({
      ...PROS_AT_COEUR,
      label: PROS_AT_COEUR.label.fr,
      audiences: [{ kind: "company", companyId: "co_1" }],
    });
    expect(announcedPickupDiscounts([company], "coeur", ASKED_AT).b2b).toBeNull();
  });

  it("ce que le contrat ne sait pas dire n'est pas annoncé faux : déclinaison, quantité minimum", () => {
    const variant = {
      ...PROS_AT_COEUR,
      scope: {
        mode: "only" as const,
        rules: [
          { target: "variant" as const, targetId: "SKU-1", eligible: true, targetRank: null },
        ],
      },
    };
    const threshold = {
      ...PROS_AT_COEUR,
      conditions: [{ kind: "min_quantity" as const, value: 3 }],
    };
    expect(announcedPickupDiscounts([variant], "coeur", ASKED_AT).b2b).toBeNull();
    expect(announcedPickupDiscounts([threshold], "coeur", ASKED_AT).b2b).toBeNull();
  });
});
