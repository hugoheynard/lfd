import { maskEmail, maskPhone } from "../particular-contact-mask.js";
import { phoneMatchKey } from "../phone-match-key.js";

describe("la clé de rapprochement d'un téléphone", () => {
  it("ramène trois graphies d'un même numéro à la même clé", () => {
    expect(phoneMatchKey("06 12 34 56 78")).toBe("0612345678");
    expect(phoneMatchKey("+33 6 12 34 56 78")).toBe("0612345678");
    expect(phoneMatchKey("0033 6.12.34.56.78")).toBe("0612345678");
  });

  it("garde un numéro étranger tel quel, en chiffres", () => {
    expect(phoneMatchKey("+32 470 12 34 56")).toBe("32470123456");
  });
});

describe("le masque des coordonnées", () => {
  it("ne laisse de l'adresse que la première lettre et le domaine", () => {
    expect(maskEmail("jean.dupont@gmail.com")).toBe("j***@gmail.com");
  });

  it("ne laisse du téléphone que deux chiffres de chaque bout", () => {
    expect(maskPhone("+33 6 12 34 56 78")).toBe("06 •• •• •• 78");
  });

  it("rend vide un téléphone absent, et masque tout un numéro trop court", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone("1234")).toBe("••");
  });
});
