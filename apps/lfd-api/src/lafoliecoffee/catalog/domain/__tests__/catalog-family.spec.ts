import { familyView, type CatalogFamily } from "../catalog-family.js";
import { NO_TRANSLATIONS } from "../catalog-translations.js";
import { family } from "./families.fixture.js";

/** Entremets › Pâtisseries › Sucré : une famille à deux parentes. */
const NESTED: CatalogFamily = {
  ...family("fam-ent", "Entremets", 3, ["fam-patis", "fam-sucre"]),
  ancestors: [
    { id: "fam-patis", name: "Pâtisseries", position: 2, nameTranslations: { en: "Pastries" } },
    { id: "fam-sucre", name: "Sucré", position: 1, nameTranslations: NO_TRANSLATIONS },
  ],
};

describe("familyView", () => {
  it("sert les parentes de la plus proche à la plus lointaine, réduites à ce qu'un rayon lit", () => {
    expect(familyView(NESTED).ancestors).toEqual([
      { id: "fam-patis", name: "Pâtisseries", position: 2 },
      { id: "fam-sucre", name: "Sucré", position: 1 },
    ]);
  });

  it("garde sa racine et son chemin à côté des parentes", () => {
    const view = familyView(NESTED);

    expect(view.root).toEqual({ id: "fam-sucre", name: "Sucré", position: 1 });
    expect(view.path).toEqual(["fam-ent", "fam-patis", "fam-sucre"]);
  });

  it("n'émet aucun champ de parentes pour une famille de tête", () => {
    const view = familyView(family("fam-vien", "Viennoiseries", 0));

    expect(view).not.toHaveProperty("ancestors");
    expect(view.root).toEqual({ id: "fam-vien", name: "Viennoiseries", position: 0 });
  });

  it("n'émet aucun champ de parentes pour une liste vide", () => {
    const view = familyView({ ...family("fam-pain", "Pains", 1), ancestors: [] });

    expect(view).not.toHaveProperty("ancestors");
  });
});
