import {
  legalDocumentParagraphPayloadSchema,
  legalDocumentParagraphSchema,
  legalDocumentSchema,
  legalRequiredSectionPayloadSchema,
} from "../legal-document.js";
import { requiredSections, sectionAnchor } from "../legal-document.sections.js";
import { legalMentionOrder } from "../platform-content.defaults.js";

const prose = { title: "Titre", body: "Corps" };
const payload = { fr: prose, en: prose, it: prose };

describe("les sections requises d'un document légal", () => {
  it("la politique de confidentialité exige la section de suppression des données", () => {
    expect(requiredSections("privacy")).toEqual(["dataDeletion"]);
  });

  it("les autres mentions n'en exigent aucune", () => {
    for (const mention of legalMentionOrder.filter((entry) => entry !== "privacy")) {
      expect(requiredSections(mention)).toEqual([]);
    }
  });

  it("l'ancre dérive de la clé, et c'est celle donnée à Meta", () => {
    expect(sectionAnchor("dataDeletion")).toBe("suppression-des-donnees");
  });
});

describe("la clé de section dans le schéma", () => {
  it("le paragraphe stocké la porte, et la relit", () => {
    const parsed = legalDocumentParagraphSchema.parse({
      ...payload,
      id: "p1",
      section: "dataDeletion",
    });
    expect(parsed.section).toBe("dataDeletion");
  });

  it("un paragraphe stocké SANS clé reste lisible — les lignes de production n'en ont pas", () => {
    expect(legalDocumentParagraphSchema.parse({ ...payload, id: "p1" }).section).toBeUndefined();
  });

  it("refuse une clé hors du vocabulaire", () => {
    expect(
      legalDocumentParagraphSchema.safeParse({ ...payload, id: "p1", section: "anything" }).success,
    ).toBe(false);
  });

  it("la charge utile d'un paragraphe NE la porte PAS : un client ne pose pas la clé (S2)", () => {
    const parsed = legalDocumentParagraphPayloadSchema.parse({
      ...payload,
      section: "dataDeletion",
    });
    expect(parsed).not.toHaveProperty("section");
  });

  it("deux paragraphes de même clé restent LISIBLES : le refus vit dans l'agrégat (B3)", () => {
    const paragraph = { ...payload, section: "dataDeletion" };
    const parsed = legalDocumentSchema.safeParse({
      title: { fr: "T", en: "T", it: "T" },
      paragraphs: [
        { ...paragraph, id: "a" },
        { ...paragraph, id: "b" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("la création d'une section exige la clé et la révision lue", () => {
    expect(legalRequiredSectionPayloadSchema.safeParse(payload).success).toBe(false);
    expect(
      legalRequiredSectionPayloadSchema.safeParse({
        ...payload,
        section: "dataDeletion",
        expectedRevision: 0,
      }).success,
    ).toBe(true);
  });
});
