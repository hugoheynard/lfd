import { promotionsAdmitted, targetingRankOf } from "../live-promotion.js";
import {
  applicationPointOf,
  canonicalFulfillment,
  type PromotionFulfillment,
} from "../promotion-fulfillment.js";
import { fulfillmentsMeet } from "../promotion-overlap.js";
import {
  fulfillmentAdmits,
  fulfillmentRankOf,
  type FulfillmentFact,
  type PromotionAudienceFacts,
} from "../promotion-targeting.js";
import { ASKED_AT, livePromotion } from "./live-promotion.fixture.js";

/**
 * **L'acheminement à cocher** (plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 3, § 8.1,
 * § 8.3, § 8.4) — admission par point et par zone, rang par fait,
 * recouvrement d'ensembles. Pur : aucune date n'est comparée à l'horloge.
 */

const DISPLAYED: PromotionFulfillment = { kind: "displayed_price" };
const basket = (
  pickup: Extract<PromotionFulfillment, { kind: "basket" }>["pickup"],
  delivery: Extract<PromotionFulfillment, { kind: "basket" }>["delivery"],
): PromotionFulfillment => ({ kind: "basket", pickup, delivery });

const AT_P1: FulfillmentFact = { method: "pickup", pickupId: "P1" };
const AT_P2: FulfillmentFact = { method: "pickup", pickupId: "P2" };
const IN_Z: FulfillmentFact = { method: "delivery", zoneId: "Z" };
const IN_Y: FulfillmentFact = { method: "delivery", zoneId: "Y" };
const NO_ZONE: FulfillmentFact = { method: "delivery", zoneId: null };
const NO_POINT_YET: FulfillmentFact = { method: "pickup", pickupId: null };

describe("fulfillmentAdmits — retrait au point P, livraison dans la zone Z (§ 3)", () => {
  const pointAndZone = basket({ points: ["P1"] }, { zones: ["Z"] });

  it.each([
    ["au point nommé", AT_P1, true],
    ["à un autre point", AT_P2, false],
    ["dans la zone nommée", IN_Z, true],
    ["dans une autre zone", IN_Y, false],
    ["en livraison sans zone", NO_ZONE, false],
    ["au retrait, point pas encore choisi", NO_POINT_YET, false],
    ["acheminement inconnu", null, false],
  ] as const)("un point + une zone : %s → %s", (_case, fact, expected) => {
    expect(fulfillmentAdmits(pointAndZone, fact)).toBe(expected);
  });

  it("« toutes les zones » admet une livraison sans zone ; une sélection, jamais", () => {
    expect(fulfillmentAdmits(basket("none", "all"), NO_ZONE)).toBe(true);
    expect(fulfillmentAdmits(basket("none", { zones: ["Z"] }), NO_ZONE)).toBe(false);
  });

  it("« tous les points » admet un point pas encore choisi ; une sélection, jamais", () => {
    expect(fulfillmentAdmits(basket("all", "none"), NO_POINT_YET)).toBe(true);
    expect(fulfillmentAdmits(basket({ points: ["P1"] }, "none"), NO_POINT_YET)).toBe(false);
  });

  it("un côté décoché n'admet rien de ce côté", () => {
    expect(fulfillmentAdmits(basket("none", "all"), AT_P1)).toBe(false);
    expect(fulfillmentAdmits(basket("all", "none"), IN_Z)).toBe(false);
  });

  it("« dans le prix affiché » admet tout, acheminement inconnu compris", () => {
    for (const fact of [AT_P1, IN_Z, NO_ZONE, null]) {
      expect(fulfillmentAdmits(DISPLAYED, fact)).toBe(true);
    }
  });

  it("le point d'application suit la forme", () => {
    expect(applicationPointOf(DISPLAYED)).toBe("line");
    expect(applicationPointOf(basket("all", "all"))).toBe("basket");
  });
});

/**
 * Les formes d'avant les cases, rejouées par la table de correspondance du
 * § 4 : leur rang pour le fait qu'elles admettent est celui de
 * `FULFILLMENT_RANK` d'avant (point 2, mode 1, tous 0).
 */
describe("fulfillmentRankOf — la table du § 4 garde le départage d'avant", () => {
  it.each([
    ["any → prix affiché", DISPLAYED, AT_P1, 0],
    ["pickup → tous les points", basket("all", "none"), AT_P1, 1],
    ["pickup_point → un point", basket({ points: ["P1"] }, "none"), AT_P1, 2],
    ["delivery → toutes les zones", basket("none", "all"), IN_Z, 1],
  ] as const)("%s : rang %s", (_case, fulfillment, fact, rank) => {
    expect(fulfillmentRankOf(fulfillment, fact)).toBe(rank);
  });

  it("une zone nommée vaut un point nommé ; un fait non admis n'a pas de rang", () => {
    expect(fulfillmentRankOf(basket("none", { zones: ["Z"] }), IN_Z)).toBe(2);
    expect(fulfillmentRankOf(basket("none", { zones: ["Z"] }), IN_Y)).toBeNull();
  });
});

describe("le rang se calcule PAR FAIT — le contre-exemple de vitruve (§ 8.3)", () => {
  // A = {points [P1], livraison toutes}, B = {retrait tous, zones [Z]}.
  const A = livePromotion({ id: "A", fulfillment: basket({ points: ["P1"] }, "all") });
  const B = livePromotion({ id: "B", fulfillment: basket("all", { zones: ["Z"] }) });
  const buyer = (fulfillment: FulfillmentFact): PromotionAudienceFacts => ({
    companyId: null,
    companyStatus: null,
    principal: { companyId: null },
    buyerKind: "registered",
    fulfillment,
  });
  const ranks = (fact: FulfillmentFact) =>
    Object.fromEntries(
      promotionsAdmitted([A, B], ASKED_AT, buyer(fact)).map((admitted) => [
        admitted.id,
        targetingRankOf(admitted).fulfillmentRank,
      ]),
    );

  it("en Z, B (2) passe avant A (1)", () => {
    expect(ranks(IN_Z)).toEqual({ A: 1, B: 2 });
  });

  it("en P1, A (2) passe avant B (1)", () => {
    expect(ranks(AT_P1)).toEqual({ A: 2, B: 1 });
  });

  it("ailleurs, chacune garde le rang de « tous »", () => {
    expect(ranks(IN_Y)).toEqual({ A: 1 });
    expect(ranks(AT_P2)).toEqual({ B: 1 });
  });
});

describe("fulfillmentsMeet — deux ensembles se croisent-ils ? (§ 3, témoins du § 8.4)", () => {
  it.each([
    [
      "deux points distincts",
      basket({ points: ["P1"] }, "none"),
      basket({ points: ["P2"] }, "none"),
      false,
    ],
    [
      "un point commun",
      basket({ points: ["P1", "P2"] }, "none"),
      basket({ points: ["P2"] }, "none"),
      true,
    ],
    [
      "tous les points contre un point",
      basket("all", "none"),
      basket({ points: ["P1"] }, "none"),
      true,
    ],
    ["retrait contre livraison", basket("all", "none"), basket("none", "all"), false],
    [
      "deux zones distinctes",
      basket("none", { zones: ["Z"] }),
      basket("none", { zones: ["Y"] }),
      false,
    ],
    [
      "une zone commune",
      basket("none", { zones: ["Z", "Y"] }),
      basket("none", { zones: ["Y"] }),
      true,
    ],
    [
      "toutes les zones contre une zone",
      basket("none", "all"),
      basket("none", { zones: ["Z"] }),
      true,
    ],
    [
      "un point + une zone contre la même zone",
      basket({ points: ["P1"] }, { zones: ["Z"] }),
      basket("none", { zones: ["Z"] }),
      true,
    ],
    [
      "un point + une zone contre un autre point et une autre zone",
      basket({ points: ["P1"] }, { zones: ["Z"] }),
      basket({ points: ["P2"] }, { zones: ["Y"] }),
      false,
    ],
    ["prix affiché contre prix affiché", DISPLAYED, DISPLAYED, true],
  ] as const)("%s → %s", (_case, left, right, expected) => {
    expect(fulfillmentsMeet(left, right)).toBe(expected);
    expect(fulfillmentsMeet(right, left)).toBe(expected);
  });
});

describe("canonicalFulfillment — points et zones triés (§ 8.4)", () => {
  it("trie sans toucher aux modes « tous » et « aucun »", () => {
    expect(canonicalFulfillment(basket({ points: ["b", "a"] }, { zones: ["z", "y"] }))).toEqual(
      basket({ points: ["a", "b"] }, { zones: ["y", "z"] }),
    );
    expect(canonicalFulfillment(basket("all", "none"))).toEqual(basket("all", "none"));
    expect(canonicalFulfillment(DISPLAYED)).toEqual(DISPLAYED);
  });
});
