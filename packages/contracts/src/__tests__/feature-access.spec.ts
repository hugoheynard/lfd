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
  /**
   * `shop`, `orders`, `invoices`, `desktopMenu` et `publicDelivery` ont été
   * retirées le 2026-10-09 (Hugo) ; `facebookLogin` est entrée le même jour.
   */
  it("porte le mandat client et la connexion par Facebook", () => {
    expect(FEATURE_KEYS).toEqual(["customerMandate", "facebookLogin"]);
    expect(Object.keys(FEATURE_CATALOGUE)).toEqual(["customerMandate", "facebookLogin"]);
  });

  /** Ajoutée le 2026-10-09 : un bouton qu'on cache, masqué tant qu'Auth0 n'est pas prêt. */
  it("porte la connexion par Facebook, masquée par défaut et non exemptible", () => {
    expect(FEATURE_CATALOGUE.facebookLogin.label).toBe("Connexion par Facebook");
    expect(FEATURE_CATALOGUE.facebookLogin.description).toContain("Auth0");
    expect(FEATURE_CATALOGUE.facebookLogin.levels).toEqual(["hidden", "visible"]);
    expect(FEATURE_CATALOGUE.facebookLogin.defaultLevel).toBe("hidden");
    expect(isExemptible("facebookLogin")).toBe(false);
    expect(mostOpenLevel("facebookLogin")).toBe("visible");
    expect(isAtLeast("facebookLogin", "hidden", "visible")).toBe(false);
  });

  /**
   * Ajoutée le 2026-09-14 (plan mandat client §8) : la clé ferme des ROUTES,
   * d'où ses niveaux propres — masquer ne ferme rien, `closed` si.
   */
  it("porte le mandat client, fermé par défaut, sur ses propres niveaux", () => {
    expect(FEATURE_CATALOGUE.customerMandate.levels).toEqual(["closed", "open"]);
    expect(FEATURE_CATALOGUE.customerMandate.defaultLevel).toBe("closed");
  });

  /** Un mandat signé par un testeur exempté serait un vrai mandat, sur un vrai compte. */
  it("rend le mandat client non exemptible", () => {
    expect(isExemptible("customerMandate")).toBe(false);
  });

  it("déclare chaque défaut parmi les niveaux de sa clé", () => {
    for (const key of FEATURE_KEYS) {
      expect(isFeatureLevel(key, FEATURE_CATALOGUE[key].defaultLevel)).toBe(true);
    }
  });

  it("reconnaît une clé du catalogue et refuse une clé retirée", () => {
    expect(isFeatureKey("customerMandate")).toBe(true);
    for (const removed of ["shop", "orders", "invoices", "desktopMenu", "publicDelivery"]) {
      expect(isFeatureKey(removed)).toBe(false);
    }
  });

  it("donne le niveau le plus ouvert : celui qu'une exemption accorderait", () => {
    expect(mostOpenLevel("customerMandate")).toBe("open");
  });
});

describe("isAtLeast — « au moins tel niveau »", () => {
  it("laisse passer le niveau exigé et tout ce qui est plus ouvert", () => {
    expect(isAtLeast("customerMandate", "open", "open")).toBe(true);
    expect(isAtLeast("customerMandate", "closed", "closed")).toBe(true);
  });

  it("refuse ce qui est plus fermé", () => {
    expect(isAtLeast("customerMandate", "closed", "open")).toBe(false);
  });

  it("suit l'ordre du catalogue, pas l'ordre alphabétique", () => {
    // « closed » < « open » par hasard dans l'alphabet : le test inverse dit
    // que c'est l'index du catalogue qui compte.
    expect(isAtLeast("customerMandate", "open", "closed")).toBe(true);
  });
});
