import {
  FEATURE_CATALOGUE,
  FEATURE_KEYS,
  isAtLeast,
  isFeatureKey,
  isFeatureLevel,
  mostOpenLevel,
} from "../feature-access.js";

describe("le catalogue de l'accès aux fonctionnalités", () => {
  it("ne porte que la boutique, fermée < voir < commander, ouverte par défaut", () => {
    // Le défaut est l'état d'avant le module : rien ne se ferme au déploiement.
    expect(FEATURE_KEYS).toEqual(["shop"]);
    expect(FEATURE_CATALOGUE.shop.levels).toEqual(["closed", "browse", "order"]);
    expect(FEATURE_CATALOGUE.shop.defaultLevel).toBe("order");
    expect(FEATURE_CATALOGUE.shop.label).toBe("Boutique");
  });

  it("déclare chaque défaut parmi les niveaux de sa clé", () => {
    for (const key of FEATURE_KEYS) {
      expect(isFeatureLevel(key, FEATURE_CATALOGUE[key].defaultLevel)).toBe(true);
    }
  });

  it("reconnaît une clé du catalogue et refuse une clé disparue", () => {
    expect(isFeatureKey("shop")).toBe(true);
    expect(isFeatureKey("legacy_flag")).toBe(false);
  });

  it("donne le niveau le plus ouvert : celui qu'une exemption accorde", () => {
    expect(mostOpenLevel("shop")).toBe("order");
  });
});

describe("isAtLeast — « au moins tel niveau »", () => {
  it("laisse passer le niveau exigé et tout ce qui est plus ouvert", () => {
    expect(isAtLeast("shop", "browse", "browse")).toBe(true);
    expect(isAtLeast("shop", "order", "browse")).toBe(true);
  });

  it("refuse ce qui est plus fermé", () => {
    expect(isAtLeast("shop", "closed", "browse")).toBe(false);
    expect(isAtLeast("shop", "browse", "order")).toBe(false);
  });

  it("suit l'ordre du catalogue, pas l'ordre alphabétique", () => {
    // « browse » < « closed » alphabétiquement : une comparaison de chaînes
    // ouvrirait la vitrine d'une boutique fermée.
    expect(isAtLeast("shop", "closed", "browse")).toBe(false);
  });
});
