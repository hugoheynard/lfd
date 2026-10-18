import {
  NO_SUGGESTION_CONDITIONS,
  type SuggestionConditions,
} from "../../value-objects/suggestion-conditions.js";
import {
  cartHasExcludedFamily,
  conditionGate,
  shopSiteOf,
  type ConditionContext,
} from "../suggestion-conditions-gate.js";

/**
 * Les jours ne sont comparés qu'à la condition, jamais à l'horloge : le
 * 2026-10-19 est un lundi, le 2026-10-18 un dimanche.
 */
const MONDAY = "2026-10-19";
const SUNDAY = "2026-10-18";

const CONTEXT: ConditionContext = {
  day: MONDAY,
  time: "09:30",
  site: { kind: "pickup", id: "site-centre" },
  cartTotalCents: 2_500,
};

function conditions(over: Partial<SuggestionConditions>): SuggestionConditions {
  return { ...NO_SUGGESTION_CONDITIONS, ...over };
}

describe("conditionGate", () => {
  it("aucune condition : rien n'écarte", () => {
    expect(conditionGate(NO_SUGGESTION_CONDITIONS, { ...CONTEXT, site: { kind: "unknown" } })).toBe(
      null,
    );
  });

  it("le jour de la semaine de l'affichage", () => {
    const weekdays = conditions({ weekdays: ["mon", "tue"] });
    expect(conditionGate(weekdays, CONTEXT)).toBeNull();
    expect(conditionGate(weekdays, { ...CONTEXT, day: SUNDAY })).toBe("outside_weekdays");
  });

  it("l'heure : début compris, fin exclue", () => {
    const morning = conditions({ hours: { from: "07:00", to: "11:00" } });
    expect(conditionGate(morning, { ...CONTEXT, time: "07:00" })).toBeNull();
    expect(conditionGate(morning, { ...CONTEXT, time: "11:00" })).toBe("outside_hours");
    expect(conditionGate(morning, { ...CONTEXT, time: "06:59" })).toBe("outside_hours");
  });

  it("le point de retrait : pas encore choisi, livraison, autre point, le bon", () => {
    const centre = conditions({ pickupAddressIds: ["site-centre"] });
    expect(conditionGate(centre, { ...CONTEXT, site: { kind: "unknown" } })).toBe("no_site_yet");
    expect(conditionGate(centre, { ...CONTEXT, site: { kind: "delivery" } })).toBe("wrong_site");
    expect(conditionGate(centre, { ...CONTEXT, site: { kind: "pickup", id: "site-gare" } })).toBe(
      "wrong_site",
    );
    expect(conditionGate(centre, CONTEXT)).toBeNull();
  });

  it("le seuil : atteint à égalité, jamais sur un montant inconnu", () => {
    const threshold = conditions({ minCartTotalCents: 2_500 });
    expect(conditionGate(threshold, CONTEXT)).toBeNull();
    expect(conditionGate(threshold, { ...CONTEXT, cartTotalCents: 2_499 })).toBe(
      "cart_below_threshold",
    );
    expect(conditionGate(threshold, { ...CONTEXT, cartTotalCents: null })).toBe(
      "cart_below_threshold",
    );
  });

  it("une seule raison, dans l'ordre : jour, heure, point, montant", () => {
    const all = conditions({
      weekdays: ["tue"],
      hours: { from: "12:00", to: "14:00" },
      pickupAddressIds: ["site-gare"],
      minCartTotalCents: 9_999,
    });
    expect(conditionGate(all, CONTEXT)).toBe("outside_weekdays");
    expect(conditionGate({ ...all, weekdays: null }, CONTEXT)).toBe("outside_hours");
    expect(conditionGate({ ...all, weekdays: null, hours: null }, CONTEXT)).toBe("wrong_site");
    expect(
      conditionGate({ ...all, weekdays: null, hours: null, pickupAddressIds: null }, CONTEXT),
    ).toBe("cart_below_threshold");
  });
});

describe("shopSiteOf", () => {
  it("sans jour visé : pas encore choisi ; sans point : la livraison", () => {
    expect(shopSiteOf(null)).toEqual({ kind: "unknown" });
    expect(shopSiteOf({ date: MONDAY, pickupAddressId: null })).toEqual({ kind: "delivery" });
    expect(shopSiteOf({ date: MONDAY, pickupAddressId: "site-a" })).toEqual({
      kind: "pickup",
      id: "site-a",
    });
  });
});

describe("cartHasExcludedFamily", () => {
  const paths = new Map([
    ["COCA", ["fam-sodas", "fam-boissons"]],
    ["VIE-001", ["fam-vien"]],
  ]);
  const noDrink = conditions({ cartWithoutFamilyId: "fam-boissons" });

  it("une sous-famille compte, un article sans famille connue non", () => {
    expect(cartHasExcludedFamily(noDrink, ["VIE-001", "COCA"], paths)).toBe(true);
    expect(cartHasExcludedFamily(noDrink, ["VIE-001", "INCONNU"], paths)).toBe(false);
    expect(cartHasExcludedFamily(NO_SUGGESTION_CONDITIONS, ["COCA"], paths)).toBe(false);
  });
});
