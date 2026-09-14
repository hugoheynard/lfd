import {
  FEATURE_CATALOGUE,
  FEATURE_KEYS,
  isAtLeast,
  isExemptible,
  isFeatureKey,
  isFeatureLevel,
  mostOpenLevel,
} from "../feature-access.js";

describe("le catalogue de l'accès aux fonctionnalités", () => {
  it("porte la boutique, fermée < voir < commander, ouverte par défaut", () => {
    // Le défaut est l'état d'avant le module : rien ne se ferme au déploiement.
    expect(FEATURE_KEYS).toEqual(["shop", "orders", "invoices", "desktopMenu", "customerMandate"]);
    expect(FEATURE_CATALOGUE.shop.levels).toEqual(["closed", "browse", "order"]);
    expect(FEATURE_CATALOGUE.shop.defaultLevel).toBe("order");
    expect(FEATURE_CATALOGUE.shop.label).toBe("Boutique");
  });

  /** Ajoutées le 2026-09-14 : masquer une surface de l'app ne ferme rien au déploiement. */
  it("porte trois surfaces masquables, montrées par défaut", () => {
    for (const key of ["orders", "invoices", "desktopMenu"] as const) {
      expect(FEATURE_CATALOGUE[key].levels).toEqual(["hidden", "visible"]);
      expect(FEATURE_CATALOGUE[key].defaultLevel).toBe("visible");
    }
  });

  /**
   * Ajoutée le 2026-09-14 (plan mandat client §8) : la clé ferme des ROUTES,
   * d'où ses niveaux propres — `hidden` ne ferme rien, `closed` si.
   */
  it("porte le mandat client, fermé par défaut, sur ses propres niveaux", () => {
    expect(FEATURE_CATALOGUE.customerMandate.levels).toEqual(["closed", "open"]);
    expect(FEATURE_CATALOGUE.customerMandate.defaultLevel).toBe("closed");
    expect(isAtLeast("customerMandate", "closed", "open")).toBe(false);
    expect(isAtLeast("customerMandate", "open", "open")).toBe(true);
  });

  /** Un mandat signé par un testeur exempté serait un vrai mandat, sur un vrai compte. */
  it("rend le mandat client non exemptible, et laisse les autres clés l'être", () => {
    expect(isExemptible("customerMandate")).toBe(false);
    for (const key of ["shop", "orders", "invoices", "desktopMenu"] as const) {
      expect(isExemptible(key)).toBe(true);
    }
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
