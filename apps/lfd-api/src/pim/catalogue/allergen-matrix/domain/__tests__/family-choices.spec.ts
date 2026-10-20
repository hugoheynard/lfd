import { familyChoices } from "../family-choices.js";
import { FAMILY_ID, OTHER_FAMILY_ID, SUB_FAMILY_ID, families } from "./matrix-fixtures.js";

/**
 * Les familles du filtre de la matrice (décision de Hugo, 2026-10-20) : la
 * liste du filtre, pas le contenu de la matrice.
 */
describe("familyChoices", () => {
  it("parcourt l'arbre : chaque mère avant ses filles, frères par rang", () => {
    expect(familyChoices(families(), "fr")).toEqual([
      { id: FAMILY_ID, label: "Viennoiseries", parentId: null, depth: 0 },
      { id: OTHER_FAMILY_ID, label: "Pains", parentId: null, depth: 0 },
      { id: SUB_FAMILY_ID, label: "Pains spéciaux", parentId: OTHER_FAMILY_ID, depth: 1 },
    ]);
  });

  it("écarte une famille archivée", () => {
    const withArchived = families().map((family) =>
      family.id === FAMILY_ID ? { ...family, isArchived: true } : family,
    );
    expect(familyChoices(withArchived, "fr").map((choice) => choice.id)).toEqual([
      OTHER_FAMILY_ID,
      SUB_FAMILY_ID,
    ]);
  });

  it("remonte à la racine une fille dont la mère est archivée", () => {
    const orphaned = families().map((family) =>
      family.id === OTHER_FAMILY_ID ? { ...family, isArchived: true } : family,
    );
    expect(familyChoices(orphaned, "fr")).toEqual([
      { id: SUB_FAMILY_ID, label: "Pains spéciaux", parentId: null, depth: 0 },
      { id: FAMILY_ID, label: "Viennoiseries", parentId: null, depth: 0 },
    ]);
  });

  it("nomme dans la langue demandée, avec repli français", () => {
    const labels = familyChoices(families(), "it").map((choice) => choice.label);
    expect(labels).toEqual(["Viennoiserie", "Pains", "Pains spéciaux"]);
  });
});
