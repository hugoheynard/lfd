import { audienceOf } from "@lfd/contracts";

import { audienceOfSalesTerms, salesTermsOf } from "../sales-terms-of.js";

describe("salesTermsOf", () => {
  it("une clientèle pro lit les CGV professionnelles", () => {
    expect(salesTermsOf("b2b")).toBe("salesTermsPro");
  });

  it("un particulier lit les CGV particuliers", () => {
    expect(salesTermsOf("b2c")).toBe("salesTerms");
  });

  /** C2″ : « pro » veut dire ce que le devis dit — une société ACTIVE seulement. */
  it("une société en attente de validation lit les CGV particuliers", () => {
    expect(salesTermsOf(audienceOf("pending"))).toBe("salesTerms");
    expect(salesTermsOf(audienceOf("active"))).toBe("salesTermsPro");
  });
});

describe("audienceOfSalesTerms", () => {
  /** É13 (Hugo, 2026-11-03) : la révision relit la clientèle sur les CGV figées. */
  it("rend la clientèle d'où les CGV ont été tirées, aller-retour exact", () => {
    expect(audienceOfSalesTerms(salesTermsOf("b2b"))).toBe("b2b");
    expect(audienceOfSalesTerms(salesTermsOf("b2c"))).toBe("b2c");
  });
});
