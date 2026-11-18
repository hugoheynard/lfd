import type { AllergenCategoryView } from "../../ports/allergen-catalogue.reader.js";
import { AllergenNaming } from "../allergen-naming.js";

/** Une catégorie de l'annexe II traduite en anglais seulement, une hors annexe nommée. */
const REFERENTIAL: readonly AllergenCategoryView[] = [
  {
    id: "alg_cat_gluten",
    key: "gluten",
    name: { fr: "Gluten", en: "Gluten (cereals)" },
    incoCategory: "gluten",
    official: true,
    position: 1,
    archivedAt: null,
    entries: [{ id: "alg_UW", code: "UW", name: { fr: "Blé" }, official: true, archivedAt: null }],
  },
  {
    id: "alg_cat_non_eu",
    key: "non_eu",
    name: { fr: "Hors obligation UE" },
    incoCategory: null,
    official: true,
    position: 2,
    archivedAt: null,
    entries: [
      {
        id: "alg_BWD",
        code: "BWD",
        name: { fr: "Sarrasin", it: "Grano saraceno" },
        official: true,
        archivedAt: null,
      },
    ],
  },
];

describe("AllergenNaming — le référentiel dans chaque langue", () => {
  const naming = AllergenNaming.from(REFERENTIAL);

  it("nomme la mention d'étiquette dans la langue demandée", () => {
    expect(naming.in("en").project(["UW"]).labels).toEqual([
      { category: "gluten", label: "Gluten (cereals)" },
    ]);
    expect(naming.in("it").outsideAnnex(["BWD"]).named[0]?.label).toBe("Grano saraceno");
  });

  it("retombe sur le français quand le référentiel n'a pas traduit", () => {
    expect(naming.in("it").project(["UW"]).labels[0]?.label).toBe("Gluten");
  });

  it("sert le français comme source, et nomme toutes les langues du référentiel", () => {
    expect(naming.source.project(["UW"]).labels[0]?.label).toBe("Gluten");
    expect(naming.locales).toEqual(["fr", "en", "it"]);
  });
});
