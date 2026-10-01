import { resolveDoorstepRule, settledOutcomeOf } from "../doorstep-rule.js";

describe("la règle d'avance à la porte (B3 bis, LB-Q6)", () => {
  it("l'adresse redéfinit le réglage global, qui vaut « Me demander » tant que personne ne l'a posé", () => {
    expect(resolveDoorstepRule(null, null)).toBe("ask");
    expect(resolveDoorstepRule("bring_back", null)).toBe("bring_back");
    expect(resolveDoorstepRule("ask", "deposit")).toBe("deposit");
    expect(resolveDoorstepRule("deposit", "ask")).toBe("ask");
  });

  it("répond d'avance pour « Déposer » et « Rapporter », jamais pour « Me demander »", () => {
    expect(settledOutcomeOf("ask")).toBeNull();
    expect(settledOutcomeOf("deposit")).toBe("authorize_deposit");
    expect(settledOutcomeOf("bring_back")).toBe("bring_back");
  });
});
