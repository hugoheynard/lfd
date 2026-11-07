import { isModelSectionId, modelSectionOfLayoutSection } from "../model-sections.js";

describe("blocs du modèle", () => {
  it("range le lien secondaire dans le bloc du bouton", () => {
    expect(modelSectionOfLayoutSection("secondaryLink")).toBe("cta");
    expect(modelSectionOfLayoutSection("cta")).toBe("cta");
  });

  it("ne reconnaît pas une section inconnue ni le lien secondaire comme bloc", () => {
    expect(modelSectionOfLayoutSection("header")).toBeNull();
    expect(isModelSectionId("secondaryLink")).toBe(false);
    expect(isModelSectionId("title")).toBe(true);
  });
});
