import { mailBlockDeclarationOf } from "../mail-block-declarations.js";
import { documentLocaleOf } from "../mail-document-locale.js";

describe("la langue des blocs libres d'un envoi (S4c)", () => {
  it("suit la langue des données quand le modèle part dans la langue du destinataire", () => {
    expect(mailBlockDeclarationOf("customer.order-placed").locales).toContain("en");
    expect(documentLocaleOf("customer.order-placed", { locale: "en" })).toBe("en");
  });

  /** Un e-mail qui ne part qu'en français : un encadré anglais sous un titre français serait faux. */
  it("garde le français pour un modèle qui ne part qu'en français, quelle que soit la donnée", () => {
    expect(mailBlockDeclarationOf("customer.collection-notice").locales).toEqual(["fr"]);
    expect(documentLocaleOf("customer.collection-notice", { locale: "it" })).toBe("fr");
  });

  it("se replie sur la première langue déclarée sans langue lisible, et sur le français hors registre", () => {
    expect(documentLocaleOf("customer.order-placed", { locale: "de" })).toBe("fr");
    expect(documentLocaleOf("customer.order-placed", null)).toBe("fr");
    expect(documentLocaleOf("hors.registre", { locale: "en" })).toBe("fr");
  });
});
