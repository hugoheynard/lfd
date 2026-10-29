import { FLAT_LINEAGE, lineageFrom } from "../catalog-family-lineage.js";

describe("lineageFrom — la lignée nommée d'une famille", () => {
  const MIRROR = [
    {
      id: "pat",
      parentId: null,
      name: "Pâtisseries",
      position: 2,
      nameTranslations: { en: "Pastries" },
    },
    { id: "pat-ent", parentId: "pat", name: "Entremets", position: 3, nameTranslations: null },
    { id: "pat-ent-8", parentId: "pat-ent", name: "8 parts", position: 0, nameTranslations: null },
  ];

  it("rend le chemin et les parentes, de la plus proche à la plus lointaine", () => {
    const lineage = lineageFrom(MIRROR)("pat-ent-8");

    expect(lineage.path).toEqual(["pat-ent-8", "pat-ent", "pat"]);
    expect(lineage.ancestors).toEqual([
      { id: "pat-ent", name: "Entremets", position: 3, nameTranslations: {} },
      { id: "pat", name: "Pâtisseries", position: 2, nameTranslations: { en: "Pastries" } },
    ]);
  });

  it("une famille racine n'a aucune parente", () => {
    expect(lineageFrom(MIRROR)("pat").ancestors).toEqual([]);
  });

  it("sans hiérarchie, chaque famille est sa propre lignée", () => {
    expect(FLAT_LINEAGE("vien")).toEqual({ path: ["vien"], ancestors: [] });
  });
});
