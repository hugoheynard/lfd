import { handoverViaOf } from "../handover-via.mapper.js";

describe("handoverViaOf — la colonne `handed_over_via` relue (AP-D8)", () => {
  /**
   * Régression évitée : les deux lecteurs du retrait ramenaient toute valeur
   * autre que `scan` à `manual` — un dépôt relu serait devenu une « saisie à
   * la main », et `republish()` l'aurait propagé au commerce.
   */
  it("relit `deposit` comme `deposit`", () => {
    expect(handoverViaOf("deposit")).toBe("deposit");
  });

  it("relit `scan` et `manual` tels quels", () => {
    expect(handoverViaOf("scan")).toBe("scan");
    expect(handoverViaOf("manual")).toBe("manual");
  });

  it("ramène l'inconnu à `manual`, jamais à `scan` : se tromper vers le bas est honnête", () => {
    expect(handoverViaOf("presume")).toBe("manual");
    expect(handoverViaOf("")).toBe("manual");
    expect(handoverViaOf("SCAN")).toBe("manual");
  });
});
