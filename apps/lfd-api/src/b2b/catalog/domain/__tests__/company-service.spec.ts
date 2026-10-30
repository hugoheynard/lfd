import { companyServiceOf } from "../company-service.js";

describe("companyServiceOf — la décision « pro ou pas » (plan pros en cours d'inscription, P0)", () => {
  it("sert une société active en pro", () => {
    expect(companyServiceOf("active")).toBe("pro");
  });

  it("sert une société en attente en pro, inchangé au lot P0", () => {
    expect(companyServiceOf("pending")).toBe("pro");
  });

  /** Régression : une suspendue était tarifée pro au rayon, au devis et à la passation. */
  it("sert une société suspendue au public tant que le staff n'a pas choisi", () => {
    expect(companyServiceOf("suspended")).toBe("public");
  });

  /** Régression : une terminée commandait encore au prix pro. */
  it("ferme une société terminée", () => {
    expect(companyServiceOf("terminated")).toBe("closed");
  });

  it("sert une société inconnue au public", () => {
    expect(companyServiceOf(null)).toBe("public");
  });
});
