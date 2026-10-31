import type { OrderLineClassification } from "../../../orders/domain/ports/order-line-classification.reader.js";
import { chooseBasketPromotion } from "../../../orders/domain/services/basket-promotion-choice.js";
import type { PromotionAudience } from "../promotion-audience.js";
import { promotionsAdmitted, type LivePromotion } from "../live-promotion.js";
import { announcedPickupDiscounts } from "../pickup-discount-announcement.js";
import { ASKED_AT, LIVE_FROM, livePromotion } from "./live-promotion.fixture.js";

/** « −20 % retrait à Cœur de station, pros actifs » : la reprise d'une remise de site. */
const PROS_AT_COEUR = livePromotion({
  id: "pd_coeur_b2b",
  audience: { kind: "pros_active" },
  fulfillment: { kind: "basket", pickup: { points: ["coeur"] }, delivery: "none" },
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
  fulfillment: { kind: "basket", pickup: { points: ["coeur"] }, delivery: "none" },
});

/** Le libellé commun des fixtures, sans traduction : le français dans les trois langues. */
const SAME_EVERYWHERE = { fr: "−20 % sur tout", en: "−20 % sur tout", it: "−20 % sur tout" };

describe("announcedPickupDiscounts — l'annonce d'un point, tirée des promotions", () => {
  it("annonce la remise des pros, d'une société en attente et des particuliers, portée comprise", () => {
    expect(announcedPickupDiscounts([PROS_AT_COEUR, PUBLIC_AT_COEUR], "coeur", ASKED_AT)).toEqual({
      b2b: {
        adjustment: { mode: "percent", bp: 2000 },
        label: SAME_EVERYWHERE,
        scope: "all_except",
        categories: [{ categoryId: "c_boissons", eligible: false }],
        products: [{ productId: "p_eau", eligible: true }],
      },
      // « Tous sauf les pros actifs » admet une société en attente.
      b2bPending: {
        adjustment: { mode: "amount", cents: 300 },
        label: SAME_EVERYWHERE,
        scope: "all_except",
        categories: [],
        products: [],
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

  /** Plan des acheminements, § 3 : une promotion annonce au point P si elle l'admet au retrait. */
  it("annonce une promotion « un point + une zone » à son point, ni ailleurs ni pour sa seule zone", () => {
    const pointAndZone = livePromotion({
      id: "point_zone",
      audience: { kind: "pros_active" },
      fulfillment: {
        kind: "basket",
        pickup: { points: ["coeur"] },
        delivery: { zones: ["zone_vallee"] },
      },
    });
    const zoneOnly = livePromotion({
      id: "zone_seule",
      audience: { kind: "pros_active" },
      fulfillment: { kind: "basket", pickup: "none", delivery: { zones: ["zone_vallee"] } },
    });

    expect(announcedPickupDiscounts([pointAndZone], "coeur", ASKED_AT).b2b?.adjustment).toEqual({
      mode: "percent",
      bp: 2000,
    });
    expect(announcedPickupDiscounts([pointAndZone], "gare", ASKED_AT).b2b).toBeNull();
    expect(announcedPickupDiscounts([zoneOnly], "coeur", ASKED_AT).b2b).toBeNull();
  });

  it("n'annonce rien à un autre point, ni une promotion de ligne", () => {
    const line = livePromotion({ id: "line" });
    expect(announcedPickupDiscounts([PROS_AT_COEUR, line], "autre", ASKED_AT)).toEqual({
      b2b: null,
      b2bPending: null,
      b2c: null,
    });
  });

  it("une promotion « tous les retraits » s'annonce à chaque point, aux deux clientèles", () => {
    const everywhere = livePromotion({
      id: "all",
      fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
    });
    const announced = announcedPickupDiscounts([everywhere], "autre", ASKED_AT);
    expect(announced.b2b?.adjustment).toEqual({ mode: "percent", bp: 2000 });
    expect(announced.b2c?.adjustment).toEqual({ mode: "percent", bp: 2000 });
  });

  it("le point précis l'emporte sur « tous les retraits », comme à la caisse", () => {
    const everywhere = livePromotion({
      id: "a_all",
      effect: { kind: "percent_off", basisPoints: 5000 },
      fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
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

describe("announcedPickupDiscounts — les bornes du temps", () => {
  const live = livePromotion({
    id: "w",
    fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
    validFrom: new Date(Date.UTC(2031, 0, 10)),
    validTo: new Date(Date.UTC(2031, 0, 20)),
  });
  const announced = (at: Date) => announcedPickupDiscounts([live], "site", at).b2c !== null;

  // Début inclus, fin exclue : la même fenêtre que la caisse (`inForceAt`).
  it("annonce dès l'instant de début, plus à l'instant de fin", () => {
    expect(announced(new Date(Date.UTC(2031, 0, 10) - 1))).toBe(false);
    expect(announced(new Date(Date.UTC(2031, 0, 10)))).toBe(true);
    expect(announced(new Date(Date.UTC(2031, 0, 20) - 1))).toBe(true);
    expect(announced(new Date(Date.UTC(2031, 0, 20)))).toBe(false);
  });

  it("une pause POSÉE PLUS TARD ne retire rien à l'instant demandé", () => {
    const willPause = { ...live, suspendedFrom: new Date(Date.UTC(2031, 0, 15)) };

    expect(
      announcedPickupDiscounts([willPause], "site", new Date(Date.UTC(2031, 0, 12))).b2c,
    ).not.toBeNull();
    expect(
      announcedPickupDiscounts([willPause], "site", new Date(Date.UTC(2031, 0, 15))).b2c,
    ).toBeNull();
  });
});

describe("announcedPickupDiscounts — chaque clientèle lit SON public et SON libellé", () => {
  const at = ASKED_AT;
  const only = (audience: PromotionAudience) =>
    announcedPickupDiscounts(
      [
        livePromotion({
          id: "x",
          audience,
          fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
        }),
      ],
      "site",
      at,
    );

  it.each([
    ["everyone", { kind: "everyone" }, true, true],
    ["pros_active", { kind: "pros_active" }, true, false],
    ["pros", { kind: "pros" }, true, false],
    ["everyone_but_active_pros", { kind: "everyone_but_active_pros" }, false, true],
    ["individuals", { kind: "individuals" }, false, true],
    // Un invité ou un inscrit n'est pas un fait de clientèle : le contrat ne le dit pas.
    ["individuals_guest", { kind: "individuals_guest" }, false, false],
    ["individuals_registered", { kind: "individuals_registered" }, false, false],
    ["pros_pending", { kind: "pros_pending" }, false, false],
  ] as const)("%s : pros %s, particuliers %s", (_kind, audience, b2b, b2c) => {
    const announced = only(audience);

    expect(announced.b2b !== null).toBe(b2b);
    expect(announced.b2c !== null).toBe(b2c);
  });

  it("le libellé annoncé est celui de la clientèle, repli sur le commun", () => {
    const labelled = livePromotion({
      id: "l",
      fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
      label: "Commun",
      audienceLabels: {
        pros: { fr: "Tarif pro", en: null, it: "Prezzo pro" },
        individuals: null,
      },
    });

    const announced = announcedPickupDiscounts([labelled], "site", at);

    expect(announced.b2b?.label).toEqual({ fr: "Tarif pro", en: "Tarif pro", it: "Prezzo pro" });
    // Une société en attente est servie en pro : la caisse lui fige le libellé Pros.
    expect(announced.b2bPending?.label).toEqual({
      fr: "Tarif pro",
      en: "Tarif pro",
      it: "Prezzo pro",
    });
    expect(announced.b2c?.label).toEqual({ fr: "Commun", en: "Commun", it: "Commun" });
  });
});

describe("announcedPickupDiscounts — l'annonce dit ce que la caisse appliquera", () => {
  const classes: ReadonlyMap<string, OrderLineClassification> = new Map();
  const lines = [{ sku: "PAI-001", htCents: 10_000, quantity: 1 }];

  /** La caisse, pour un acheteur type : le même juge, puis `chooseBasketPromotion`. */
  function atCheckout(promotions: readonly LivePromotion[], clientele: "b2b" | "b2c") {
    const admitted = promotionsAdmitted(promotions, ASKED_AT, {
      companyId: null,
      companyStatus: clientele === "b2b" ? "active" : null,
      principal: { companyId: null },
      buyerKind: "unknown",
      fulfillment: { method: "pickup", pickupId: "site" },
    });
    return chooseBasketPromotion(admitted, lines, classes);
  }

  const CATALOGUE: readonly LivePromotion[] = [
    livePromotion({ id: "p1", fulfillment: { kind: "basket", pickup: "all", delivery: "none" } }),
    livePromotion({
      id: "p2",
      fulfillment: { kind: "basket", pickup: { points: ["site"] }, delivery: "none" },
      effect: { kind: "percent_off", basisPoints: 500 },
      audience: { kind: "pros_active" },
    }),
    livePromotion({
      id: "p3",
      fulfillment: { kind: "basket", pickup: { points: ["autre"] }, delivery: "none" },
      effect: { kind: "percent_off", basisPoints: 9000 },
    }),
    livePromotion({
      id: "p4",
      fulfillment: { kind: "basket", pickup: "none", delivery: "all" },
      effect: { kind: "percent_off", basisPoints: 9000 },
    }),
    livePromotion({
      id: "p5",
      fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
      audience: { kind: "everyone_but_active_pros" },
      effect: { kind: "percent_off", basisPoints: 1500 },
    }),
  ];

  // Le point précis des pros (5 %) bat le retrait de tous (20 %) ; les
  // particuliers, eux, ont le retrait « sauf pros » (15 %) : plus spécifique au
  // public que « tout le monde ». La livraison et l'autre point ne comptent pas.
  it.each(["b2b", "b2c"] as const)(
    "la clientèle %s : même ajustement que la caisse",
    (clientele) => {
      const announced = announcedPickupDiscounts(CATALOGUE, "site", ASKED_AT)[clientele];
      const cashier = atCheckout(CATALOGUE, clientele);

      expect(announced?.adjustment).toEqual(cashier.discountAdjustment);
    },
  );

  it("annonce 5 % aux pros et 15 % aux particuliers", () => {
    const announced = announcedPickupDiscounts(CATALOGUE, "site", ASKED_AT);

    expect(announced.b2b?.adjustment).toEqual({ mode: "percent", bp: 500 });
    expect(announced.b2c?.adjustment).toEqual({ mode: "percent", bp: 1_500 });
  });

  it("rend la même annonce quel que soit l'ordre des promotions", () => {
    expect(announcedPickupDiscounts([...CATALOGUE].reverse(), "site", ASKED_AT)).toEqual(
      announcedPickupDiscounts(CATALOGUE, "site", ASKED_AT),
    );
  });

  it("à rang et effet égaux, le plus petit identifiant, comme à la caisse", () => {
    const twins = ["m", "b", "q"].map((id) =>
      livePromotion({ id, fulfillment: { kind: "basket", pickup: "all", delivery: "none" } }),
    );
    const withLabel = twins.map((twin) => ({ ...twin, label: { ...twin.label, fr: twin.id } }));

    expect(announcedPickupDiscounts(withLabel, "site", ASKED_AT).b2c?.label?.fr).toBe("b");
    expect(atCheckout(withLabel, "b2c").label?.fr).toBe("b");
  });
});
