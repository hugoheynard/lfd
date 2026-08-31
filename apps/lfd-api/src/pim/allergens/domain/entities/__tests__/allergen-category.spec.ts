import {
  AllergenCategoryKeyInvalidError,
  AllergenLabelRequiredError,
  AllergenPositionInvalidError,
  OfficialAllergenCategoryLockedError,
  UnknownIncoCategoryError,
} from "../../errors/allergen-errors.js";
import { AllergenCategory, type AllergenCategoryState } from "../allergen-category.js";

/**
 * L'instant que le port `Clock` aurait rendu. Jamais comparé à l'horloge —
 * l'agrégat ne fait que le ranger — donc rien ici ne périme avec le calendrier.
 */
const NOW = new Date();

/** Une minute plus tard, pour éprouver l'idempotence de l'archivage. */
const LATER = new Date(NOW.getTime() + 60_000);

/** La ligne semée par la migration, telle que la base la rend. */
function officialCategory(): AllergenCategoryState {
  return {
    id: "alg_cat_tree_nuts",
    key: "tree_nuts",
    name: { fr: "Fruits à coque", en: "Tree nuts" },
    incoCategory: "tree_nuts",
    official: true,
    position: 8,
    archivedAt: null,
  };
}

function houseCategory(): AllergenCategory {
  return AllergenCategory.declare({
    id: "cat_1",
    key: "maison",
    name: { fr: "Maison" },
    position: 0,
  });
}

describe("AllergenCategory", () => {
  it("déclare une catégorie maison, clé nettoyée et rang posé", () => {
    const category = AllergenCategory.declare({
      id: "cat_1",
      key: "  fruits-coque-exotiques  ",
      name: { fr: " Fruits à coque exotiques " },
      position: 20,
    });

    expect(category.snapshot()).toEqual({
      id: "cat_1",
      key: "fruits-coque-exotiques",
      name: { fr: "Fruits à coque exotiques" },
      incoCategory: null,
      official: false,
      position: 20,
      archivedAt: null,
    });
  });

  // La règle de sûreté du plan, rendue INEXPRIMABLE plutôt que vérifiée : une
  // catégorie maison ne doit jamais pouvoir se faire passer pour une mention
  // réglementaire sur une étiquette UE.
  it("ne laisse aucun chemin pour déclarer une catégorie réglementaire", () => {
    const category = AllergenCategory.declare({
      id: "cat_1",
      key: "gluten-maison",
      name: { fr: "Gluten maison" },
      position: 0,
    });

    expect(category.isOfficial).toBe(false);
    expect(category.incoCategory).toBeNull();
  });

  it("refuse une clé qui n'est pas une identité", () => {
    expect(() =>
      AllergenCategory.declare({
        id: "cat_1",
        key: "Fruits à coque",
        name: { fr: "Fruits à coque" },
        position: 0,
      }),
    ).toThrow(AllergenCategoryKeyInvalidError);
  });

  it("refuse un libellé illisible dans la langue source", () => {
    expect(() =>
      AllergenCategory.declare({
        id: "cat_1",
        key: "maison",
        name: { fr: "   ", en: "House" },
        position: 0,
      }),
    ).toThrow(AllergenLabelRequiredError);
  });

  it("refuse un rang qui n'est pas un ordre", () => {
    expect(() =>
      AllergenCategory.declare({
        id: "cat_1",
        key: "maison",
        name: { fr: "Maison" },
        position: -1,
      }),
    ).toThrow(AllergenPositionInvalidError);
  });

  it("renomme une catégorie maison", () => {
    const category = AllergenCategory.declare({
      id: "cat_1",
      key: "maison",
      name: { fr: "Maison" },
      position: 0,
    });

    category.rename({ fr: "Fruits à coque exotiques", en: "Exotic nuts" });

    expect(category.snapshot().name).toEqual({
      fr: "Fruits à coque exotiques",
      en: "Exotic nuts",
    });
  });

  // Le trigger tient la base ; l'agrégat refuse AVANT, pour que le staff lise
  // la règle et le geste de sortie au lieu d'un `restrict_violation` Postgres.
  it("refuse de renommer une catégorie officielle", () => {
    const category = AllergenCategory.reconstitute(officialCategory());

    expect(() => category.rename({ fr: "Noix diverses" })).toThrow(
      OfficialAllergenCategoryLockedError,
    );
    expect(category.snapshot().name).toEqual({ fr: "Fruits à coque", en: "Tree nuts" });
  });

  it("nomme le cas réel et le geste de sortie dans son refus", () => {
    const category = AllergenCategory.reconstitute(officialCategory());

    expect(() => category.rename({ fr: "Noix diverses" })).toThrow(/tree_nuts.*catégorie maison/su);
  });

  // L'ordre d'affichage n'a aucune portée réglementaire — le trigger laisse
  // `position` libre pour cette raison exacte, et l'agrégat fait pareil.
  it("laisse ranger une catégorie officielle dans l'écran", () => {
    const category = AllergenCategory.reconstitute(officialCategory());

    category.moveTo(3);

    expect(category.snapshot()).toMatchObject({ position: 3, official: true });
  });

  // `moveTo` est le second appelant de la garde de rang : rien ne dit qu'un
  // futur refactor la laisse branchée aux deux endroits. Un rang n'est ni du
  // droit ni un réglage — il refuse une valeur absurde, officiel ou pas.
  it("refuse un rang qui n'est pas un ordre, y compris sur une catégorie maison", () => {
    const category = AllergenCategory.declare({
      id: "cat_1",
      key: "maison",
      name: { fr: "Maison" },
      position: 0,
    });

    expect(() => category.moveTo(-1)).toThrow(AllergenPositionInvalidError);
    expect(category.snapshot().position).toBe(0);
  });

  /**
   * Le trigger `allergen_category_official_lock` gèle `archived_at` avec le
   * reste, mais l'agrégat doit refuser d'abord : le staff lit un motif métier,
   * pas une `restrict_violation` Postgres.
   */
  it("refuse d'archiver une catégorie officielle", () => {
    const category = AllergenCategory.reconstitute(officialCategory());

    expect(() => category.archive(NOW)).toThrow(OfficialAllergenCategoryLockedError);
    expect(category.isArchived).toBe(false);
  });

  it("refuse de restaurer une catégorie officielle", () => {
    const category = AllergenCategory.reconstitute(officialCategory());

    expect(() => category.restore()).toThrow(OfficialAllergenCategoryLockedError);
  });

  it("archive une catégorie maison à l'instant qu'on lui donne", () => {
    const category = houseCategory();

    category.archive(NOW);

    expect(category.isArchived).toBe(true);
    expect(category.snapshot().archivedAt).toBe(NOW);
  });

  // Idempotent, et la PREMIÈRE date gagne : l'archivage répond à « depuis quand
  // cette catégorie n'est plus proposée », pas « depuis le dernier clic ».
  it("garde la date du premier archivage", () => {
    const category = houseCategory();

    category.archive(NOW);
    category.archive(LATER);

    expect(category.snapshot().archivedAt).toBe(NOW);
  });

  it("remet une catégorie maison au référentiel", () => {
    const category = houseCategory();
    category.archive(NOW);

    category.restore();

    expect(category.isArchived).toBe(false);
    expect(category.snapshot().archivedAt).toBeNull();
  });

  // La « première date gagne » vaut pour une série d'archivages consécutifs —
  // pas pour l'éternité de la catégorie. Un `restore()` remet le compteur à
  // zéro : le prochain `archive()` répond de nouveau à « depuis quand », et doit
  // donc prendre la date qu'on lui donne.
  it("reprend une date fraîche pour un nouvel archivage après un restore", () => {
    const category = houseCategory();

    category.archive(NOW);
    category.restore();
    category.archive(LATER);

    expect(category.snapshot().archivedAt).toBe(LATER);
  });

  // L'archivage ne fige pas l'écran : une catégorie retirée peut encore être
  // rangée, comme une catégorie officielle. `position` n'est ni du droit ni un
  // état de cycle de vie.
  it("laisse ranger une catégorie maison archivée", () => {
    const category = houseCategory();
    category.archive(NOW);

    category.moveTo(7);

    expect(category.snapshot()).toMatchObject({ position: 7, archivedAt: NOW });
  });

  it("relit la catégorie INCO d'une ligne semée", () => {
    expect(AllergenCategory.reconstitute(officialCategory()).incoCategory).toBe("tree_nuts");
  });

  // Une ligne écrite hors du domaine — psql, migration correctrice — se signale
  // à la relecture plutôt que de ressortir vers une projection d'étiquette.
  it("refuse de relire une catégorie INCO hors annexe II", () => {
    expect(() =>
      AllergenCategory.reconstitute({ ...officialCategory(), incoCategory: "chocolat" }),
    ).toThrow(UnknownIncoCategoryError);
  });

  it("fait le tour complet base → agrégat → base", () => {
    const state = officialCategory();

    expect(AllergenCategory.reconstitute(state).snapshot()).toEqual(state);
  });
});
