import { longestMatchingPrefix } from "../delivery-zone.js";
import { cartAdjustmentCents } from "../cart-adjustment.js";

describe("longestMatchingPrefix — résolution de zone (le plus spécifique gagne)", () => {
  it("matche un code exact (préfixe complet)", () => {
    expect(longestMatchingPrefix(["73150"], "73150")).toBe(5);
  });

  it("matche un préfixe de secteur", () => {
    expect(longestMatchingPrefix(["731"], "73150")).toBe(3);
  });

  it("rend -1 quand rien ne matche", () => {
    expect(longestMatchingPrefix(["74"], "73150")).toBe(-1);
    expect(longestMatchingPrefix([], "73150")).toBe(-1);
  });

  it("rend la longueur du PLUS LONG préfixe qui matche (départage)", () => {
    // Un secteur large `731` et un code exact `73150` : le plus spécifique gagne.
    expect(longestMatchingPrefix(["731", "73150"], "73150")).toBe(5);
    expect(longestMatchingPrefix(["731", "73150"], "73120")).toBe(3);
  });

  it("ne matche pas un préfixe plus long que le code", () => {
    expect(longestMatchingPrefix(["731509"], "73150")).toBe(-1);
  });
});

describe("cartAdjustmentCents — montant appliqué (autorité serveur)", () => {
  it("montant fixe : rendu tel quel, jamais négatif", () => {
    expect(cartAdjustmentCents({ mode: "amount", cents: 2000 }, 5000)).toBe(2000);
    expect(cartAdjustmentCents({ mode: "amount", cents: 0 }, 5000)).toBe(0);
  });

  it("pourcentage : bp sur le sous-total, arrondi au centime", () => {
    // 20 % de 4000 = 800.
    expect(cartAdjustmentCents({ mode: "percent", bp: 2000 }, 4000)).toBe(800);
    // 20 % de 4001 = 800.2 → 800.
    expect(cartAdjustmentCents({ mode: "percent", bp: 2000 }, 4001)).toBe(800);
    // 100 % → tout le sous-total.
    expect(cartAdjustmentCents({ mode: "percent", bp: 10000 }, 4001)).toBe(4001);
  });
});
