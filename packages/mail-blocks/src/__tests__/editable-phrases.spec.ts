import { isEditablePhrase, type MailTemplateDeclaration } from "../mail-document.js";

/** § 23 du plan de l'éditeur : une liste déclarée borne ce que l'éditeur réécrit. */

const BASE: MailTemplateDeclaration = { modelBlocks: ["body"], locales: ["fr"], charter: "lfc" };

describe("isEditablePhrase", () => {
  it("sans liste déclarée, toute phrase s'écrit — l'état d'avant la règle", () => {
    expect(isEditablePhrase(BASE, "recapPickup")).toBe(true);
  });

  it("avec une liste, seules ses phrases s'écrivent", () => {
    const declaration = { ...BASE, editablePhrases: ["title", "intro"] };
    expect(isEditablePhrase(declaration, "intro")).toBe(true);
    expect(isEditablePhrase(declaration, "recapPickup")).toBe(false);
  });

  it("une liste vide n'en laisse aucune", () => {
    expect(isEditablePhrase({ ...BASE, editablePhrases: [] }, "title")).toBe(false);
  });
});
