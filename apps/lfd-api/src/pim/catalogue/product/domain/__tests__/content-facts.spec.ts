import { PRODUCT_FACT_TYPES } from "../../../revision/domain/attribution.js";
import { PIM_EVENTS } from "../../../../journal/pim-journal.js";
import { CLASSIFIED_PRODUCT_FACTS, isContentFact } from "../content-facts.js";

describe("les faits de contenu d'une fiche", () => {
  /**
   * 🔴 La garde du dispositif.
   *
   * Un fait `product.*` ajouté sans être classé ici serait muet — et le silence
   * se lit « rien n'a changé », donc une signature resterait verte sur une fiche
   * modifiée. Le test parcourt la liste réelle des faits produit plutôt qu'une
   * copie : c'est ce qui l'empêche de vieillir.
   */
  it("classe TOUS les faits de produit, sans exception", () => {
    const classified = new Set(CLASSIFIED_PRODUCT_FACTS);
    const unclassified = PRODUCT_FACT_TYPES.filter((type) => !classified.has(type));
    expect(unclassified).toEqual([]);
  });

  it("ne classe rien qui ne soit pas un fait de produit", () => {
    const known = new Set(PRODUCT_FACT_TYPES);
    expect(CLASSIFIED_PRODUCT_FACTS.filter((type) => !known.has(type))).toEqual([]);
  });

  /**
   * Régression : `contentUpdatedAt` lisait `product.updated_at`, un `@updatedAt`
   * Prisma posé sur la ligne qui porte `status`. Mettre en vente périmait donc
   * la signature qui justifiait la mise en vente, et l'écran affichait « la
   * fiche a été modifiée depuis » sur une fiche inchangée (audit 2026-09-01).
   */
  it("ne compte AUCUNE transition de statut comme une modification du contenu", () => {
    expect(isContentFact(PIM_EVENTS.productPublished)).toBe(false);
    expect(isContentFact(PIM_EVENTS.productUnpublished)).toBe(false);
    expect(isContentFact(PIM_EVENTS.productArchived)).toBe(false);
    expect(isContentFact(PIM_EVENTS.productRestored)).toBe(false);
  });

  it("ne compte pas la signature elle-même — elle se périmerait en naissant", () => {
    expect(isContentFact(PIM_EVENTS.productDeclaredReady)).toBe(false);
  });

  /**
   * Régression : taux et canaux vivent dans des tables satellites que l'ancienne
   * mesure ne regardait pas. Changer le taux d'un produit ne périmait donc
   * aucune signature (audit 2026-09-01).
   */
  it("compte les taux et les canaux, que l'horodatage de ligne ratait", () => {
    expect(isContentFact(PIM_EVENTS.productVatChanged)).toBe(true);
    expect(isContentFact(PIM_EVENTS.productChannelsChanged)).toBe(true);
  });

  it("compte ce que la signature engage", () => {
    expect(isContentFact(PIM_EVENTS.productIdentitySaved)).toBe(true);
    expect(isContentFact(PIM_EVENTS.productPricingSaved)).toBe(true);
    expect(isContentFact(PIM_EVENTS.productDeclarationSaved)).toBe(true);
    expect(isContentFact(PIM_EVENTS.productEditorialSaved)).toBe(true);
    expect(isContentFact(PIM_EVENTS.productMediaSaved)).toBe(true);
    expect(isContentFact(PIM_EVENTS.productIngredientsSaved)).toBe(true);
    expect(isContentFact(PIM_EVENTS.productCreated)).toBe(true);
  });

  it("reste muet sur un type inconnu plutôt que de périmer à tort", () => {
    expect(isContentFact("product.something_new")).toBe(false);
    expect(isContentFact("")).toBe(false);
  });
});
