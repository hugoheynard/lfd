import {
  orderTouchesPublicShelf,
  publicShelfVerdict,
  switchPurgesPublicShelf,
} from "../public-shelf-rules.js";

/**
 * Les règles du rayon public (C3, `le-rayon-en-cache.md` § 3 et § 5).
 * Ces tests échouent si une réponse se garde drapeau éteint, sans relevé, ou
 * après une purge passée pendant son calcul — et si une purge de société
 * purge Workers Cache pour rien (l'offre gratuite limite les purges).
 */
const ON = { enabled: true, version: 4 };

describe("publicShelfVerdict", () => {
  it("se garde : drapeau allumé aux deux relevés, même version", () => {
    expect(publicShelfVerdict(ON, ON)).toEqual({ cacheable: true });
  });

  it("ne se garde pas drapeau éteint, à l'un ou l'autre relevé", () => {
    const off = { enabled: false, version: 4 };
    expect(publicShelfVerdict(off, off)).toEqual({ cacheable: false, reason: "disabled" });
    expect(publicShelfVerdict(ON, off)).toEqual({ cacheable: false, reason: "disabled" });
    expect(publicShelfVerdict(off, ON)).toEqual({ cacheable: false, reason: "disabled" });
  });

  it("ne se garde pas si la version a bougé pendant le calcul", () => {
    expect(publicShelfVerdict(ON, { enabled: true, version: 5 })).toEqual({
      cacheable: false,
      reason: "version_moved",
    });
  });

  it("ne se garde jamais sans l'un des relevés (objet injoignable, lent, disjoncteur)", () => {
    expect(publicShelfVerdict(null, ON)).toEqual({ cacheable: false, reason: "unavailable" });
    expect(publicShelfVerdict(ON, null)).toEqual({ cacheable: false, reason: "unavailable" });
    expect(publicShelfVerdict(null, null)).toEqual({ cacheable: false, reason: "unavailable" });
  });
});

describe("orderTouchesPublicShelf", () => {
  it("« tout » touche le rayon public", () => {
    expect(orderTouchesPublicShelf({ kind: "all" })).toBe(true);
  });

  it("une société ne le touche pas : le rayon public se calcule sans société", () => {
    expect(orderTouchesPublicShelf({ kind: "companies", companyIds: ["co_a", "co_b"] })).toBe(
      false,
    );
  });
});

describe("switchPurgesPublicShelf", () => {
  it("éteindre, éteindre le public et vider purgent ; allumer ne purge rien", () => {
    expect(switchPurgesPublicShelf("off")).toBe(true);
    expect(switchPurgesPublicShelf("public-off")).toBe(true);
    expect(switchPurgesPublicShelf("purge")).toBe(true);
    expect(switchPurgesPublicShelf("on")).toBe(false);
    expect(switchPurgesPublicShelf("public-on")).toBe(false);
  });
});
