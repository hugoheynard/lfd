import { audienceOf } from "@lfd/contracts";

import { salesTermsOf } from "../sales-terms-of.js";

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
