import { DEFAULT_LEGAL_DOCUMENT } from "../legal-document.defaults.js";
import { requiredSections } from "../legal-document.sections.js";
import {
  DEFAULT_FOOTER_CONTENT,
  legalDocumentKeys,
  legalMentionLabels,
  legalMentionOrder,
} from "../platform-content.defaults.js";
import { footerContentSchema } from "../platform-content.js";

/** Les CGU, sixième mention (décision de Hugo, 2026-10-26). */
describe("la mention « Conditions générales d'utilisation »", () => {
  it("est une mention du bandeau, donc aussi un document légal", () => {
    expect(legalMentionOrder).toContain("termsOfUse");
    expect(legalDocumentKeys).toContain("termsOfUse");
  });

  it("porte son nom consacré dans les trois langues", () => {
    expect(legalMentionLabels.fr.termsOfUse).toBe("Conditions générales d'utilisation");
    expect(legalMentionLabels.en.termsOfUse).toBe("Terms of use");
    expect(legalMentionLabels.it.termsOfUse).toBe("Condizioni generali d'uso");
  });

  it("part d'un document titré et vide, sans section requise", () => {
    expect(DEFAULT_LEGAL_DOCUMENT("termsOfUse")).toEqual({
      title: {
        fr: "Conditions générales d'utilisation",
        en: "Terms of use",
        it: "Condizioni generali d'uso",
      },
      paragraphs: [],
    });
    expect(requiredSections("termsOfUse")).toEqual([]);
  });

  it("s'affiche au pied de page par défaut, même relue d'une ligne qui l'ignore", () => {
    expect(DEFAULT_FOOTER_CONTENT.legalMentions.termsOfUse).toBe(true);
    const { termsOfUse: _omitted, ...before } = DEFAULT_FOOTER_CONTENT.legalMentions;
    const parsed = footerContentSchema.parse({ ...DEFAULT_FOOTER_CONTENT, legalMentions: before });
    expect(parsed.legalMentions.termsOfUse).toBe(true);
  });
});
