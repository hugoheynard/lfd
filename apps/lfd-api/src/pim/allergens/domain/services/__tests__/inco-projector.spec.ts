import type { AllergenCategoryView } from "../../ports/allergen-catalogue.reader.js";
import type { IncoCategory } from "../../value-objects/inco-category.js";
import { IncoProjector } from "../inco-projector.js";

/**
 * La projection d'étiquette, **sans Nest et sans base** : on la construit depuis
 * une vue de référentiel, on projette, on assert.
 *
 * Ce qu'elle protège n'est pas un écran, c'est une mention obligatoire. Une
 * liste amputée qui se tait s'affiche « sans allergène » — l'affirmation
 * positive à la place du silence, sur une surface en service.
 */

let nextPosition = 0;

function category(
  key: string,
  incoCategory: IncoCategory | null,
  codes: readonly string[],
  over: { readonly archived?: boolean; readonly label?: string } = {},
): AllergenCategoryView {
  nextPosition += 1;
  return {
    id: `alg_cat_${key}`,
    key,
    name: { fr: over.label ?? key, en: key },
    incoCategory,
    official: true,
    position: nextPosition,
    archivedAt: null,
    entries: codes.map((code) => ({
      id: `alg_${code}`,
      code,
      name: { fr: code, en: code },
      official: true,
      archivedAt: over.archived === true ? new Date() : null,
    })),
  };
}

/** Le référentiel réel, réduit à ce qui distingue les trois sorts d'un code. */
function referential(): readonly AllergenCategoryView[] {
  nextPosition = 0;
  return [
    category("gluten", "gluten", ["UW", "NR", "GB"], {
      label: "Céréales contenant du gluten",
    }),
    category("tree_nuts", "tree_nuts", ["SH", "SA"], { label: "Fruits à coque" }),
    // Officielle, SANS mention de l'annexe II : ses codes sont connus et
    // n'entrent jamais dans une étiquette UE.
    category("non_eu", null, ["SO", "BWD", "NM"], { label: "Hors obligation UE" }),
    // Maison : déclarable, jamais réglementaire (D1).
    category("fruits-coque-exotiques", null, ["MAISON"]),
  ];
}

function project(codes: readonly string[]) {
  return IncoProjector.from(referential(), "fr").project(codes);
}

describe("IncoProjector — ce qui s'imprime", () => {
  it("rend la mention de la CATÉGORIE, pas le nom granulaire de l'entrée", () => {
    expect(project(["SH"])).toEqual({
      labels: [{ category: "tree_nuts", label: "Fruits à coque" }],
      incomplete: false,
    });
  });

  it("dédoublonne le n:1 — trois céréales ne font qu'une mention", () => {
    expect(project(["UW", "NR", "GB"]).labels).toEqual([
      { category: "gluten", label: "Céréales contenant du gluten" },
    ]);
  });

  /**
   * Le nombre de codes rendus ≠ le nombre de codes déclarés n'est PAS une
   * amputation : c'est la raison d'être du modèle n:1. Une confusion entre
   * « fusionné » et « amputé » ferait lever `incomplete` sur une déclaration
   * parfaitement complète, dès qu'elle cite plus d'une céréale.
   */
  it("ne signale rien : le n:1 fusionne, il n'ampute pas", () => {
    expect(project(["UW", "NR", "GB"])).toEqual({
      labels: [{ category: "gluten", label: "Céréales contenant du gluten" }],
      incomplete: false,
    });
  });

  it("rend une liste vide COMPLÈTE pour une fiche déclarée sans allergène", () => {
    expect(project([])).toEqual({ labels: [], incomplete: false });
  });

  it("localise depuis le référentiel, langue par langue", () => {
    const anglais = IncoProjector.from(referential(), "en").project(["SH"]);

    expect(anglais.labels[0]?.label).toBe("tree_nuts");
  });
});

/**
 * **Le drapeau qui manquait.** Un code déclaré peut disparaître de la projection
 * de deux façons — inconnu, ou connu sans obligation UE — et les deux amputent
 * la liste. Ne compter que la première a fait afficher « Sans allergène » sur
 * des articles qui déclaraient la noix de coco (fix 2026-08-31, côté
 * plateforme). Le fil le rejouerait s'il ne portait pas `incomplete`.
 */
describe("IncoProjector — la liste amputée", () => {
  it("signale un code hors obligation UE, connu mais non imprimable", () => {
    expect(project(["SO"])).toEqual({ labels: [], incomplete: true });
  });

  it("signale les trois codes hors UE, pas seulement la noix de coco", () => {
    for (const code of ["SO", "BWD", "NM"]) {
      expect(project([code])).toEqual({ labels: [], incomplete: true });
    }
  });

  it("signale un code que le référentiel ne connaît pas", () => {
    expect(project(["ZZZZ"])).toEqual({ labels: [], incomplete: true });
  });

  it("signale l'amputation même quand la liste rendue n'est pas vide", () => {
    expect(project(["SH", "SO"])).toEqual({
      labels: [{ category: "tree_nuts", label: "Fruits à coque" }],
      incomplete: true,
    });
  });

  /**
   * Une entrée maison est déclarable (D2) et n'apparaît **jamais** comme mention
   * réglementaire (D1) — sa catégorie ne porte pas d'`incoCategory`. La fiche
   * est donc amputée du point de vue de l'étiquette UE, et le dit.
   */
  it("écarte une entrée maison de l'étiquette, en le signalant", () => {
    expect(project(["MAISON"])).toEqual({ labels: [], incomplete: true });
  });
});

describe("IncoProjector — l'archivage ne retire pas ce qui est déjà déclaré", () => {
  /**
   * D2 bis : l'archivage retire une entrée de ce qu'on PROPOSE, jamais de ce
   * qu'on reconnaît. Une étiquette déjà imprimée ne se vide pas parce que le
   * staff a rangé son écran du référentiel.
   */
  it("projette une entrée archivée comme les autres", () => {
    const withArchived = [
      category("tree_nuts", "tree_nuts", ["SH"], { label: "Fruits à coque", archived: true }),
    ];

    expect(IncoProjector.from(withArchived, "fr").project(["SH"])).toEqual({
      labels: [{ category: "tree_nuts", label: "Fruits à coque" }],
      incomplete: false,
    });
  });

  /**
   * D2 bis vaut aussi pour la CATÉGORIE, pas seulement pour l'entrée : le
   * sélecteur de saisie masque une catégorie archivée, mais une étiquette déjà
   * imprimée qui la cite ne doit pas s'en trouver amputée pour autant.
   */
  it("projette une catégorie archivée comme les autres", () => {
    const archivedCategory: AllergenCategoryView = {
      ...category("tree_nuts", "tree_nuts", ["SH"], { label: "Fruits à coque" }),
      archivedAt: new Date(),
    };

    expect(IncoProjector.from([archivedCategory], "fr").project(["SH"])).toEqual({
      labels: [{ category: "tree_nuts", label: "Fruits à coque" }],
      incomplete: false,
    });
  });
});
