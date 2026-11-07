import { MAIL_DATA_BLOCK_IDS, MAIL_LINK_SLOTS } from "../mail-resources.js";
import { MODEL_SECTIONS, modelSectionOfLayoutSection } from "../model-sections.js";

/** Le contrat des ressources (plan `plan-editeur-par-blocs.md`, § 24, R1). */
describe("les ressources d'un e-mail", () => {
  it("rangent les blocs de données parmi les blocs du modèle, dans l'ordre de la coquille", () => {
    const data = MODEL_SECTIONS.filter((section) =>
      MAIL_DATA_BLOCK_IDS.some((id) => id === section),
    );
    expect(data).toEqual(MAIL_DATA_BLOCK_IDS);
  });

  it("posent les deux liens dans le bloc du bouton", () => {
    expect(MAIL_LINK_SLOTS.map(modelSectionOfLayoutSection)).toEqual(["cta", "cta"]);
  });
});
