import { companyServiceOf, servedCompanyServiceOf } from "../company-service.js";

describe("companyServiceOf — la décision « pro ou pas » (plan pros en cours d'inscription, P0)", () => {
  it("sert une société active en pro", () => {
    expect(companyServiceOf("active")).toBe("pro");
  });

  it("sert une société en attente en pro, inchangé au lot P0", () => {
    expect(companyServiceOf("pending")).toBe("pro");
  });

  /**
   * Révisé le 2026-11-03 (Hugo, `plan-suspendue-au-prix-pro.md` § 5) : la
   * suspension ne touche plus qu'au crédit, le prix reste le sien.
   */
  it("sert une société suspendue en pro, à son tarif", () => {
    expect(companyServiceOf("suspended")).toBe("pro");
  });

  /** Régression : une terminée commandait encore au prix pro. */
  it("ferme une société terminée", () => {
    expect(companyServiceOf("terminated")).toBe("closed");
  });

  it("sert une société inconnue au public", () => {
    expect(companyServiceOf(null)).toBe("public");
  });
});

describe("servedCompanyServiceOf — la société lue entière, suppression comprise", () => {
  it.each(["pending", "active", "suspended"] as const)(
    "🔴 ferme une société supprimée, même %s",
    (status) => {
      expect(servedCompanyServiceOf({ status, archivedAt: new Date(0) })).toBe("closed");
    },
  );

  it("non supprimée : la décision du statut", () => {
    expect(servedCompanyServiceOf({ status: "active", archivedAt: null })).toBe("pro");
    expect(servedCompanyServiceOf({ status: "terminated", archivedAt: null })).toBe("closed");
  });
});
