import {
  AllergenLabelRequiredError,
  OfficialAllergenEntryLockedError,
} from "../../errors/allergen-errors.js";
import { AllergenEntry, type AllergenEntrySnapshot } from "../allergen-entry.js";

/**
 * L'instant que le port `Clock` aurait rendu. Jamais comparé à l'horloge —
 * l'agrégat ne fait que le ranger — donc rien ici ne périme avec le calendrier.
 */
const NOW = new Date();

/** Une minute plus tard, pour éprouver l'idempotence de l'archivage. */
const LATER = new Date(NOW.getTime() + 60_000);

/** La ligne semée par la migration, telle que la base la rend. */
function officialEntry(): AllergenEntrySnapshot {
  return {
    id: "alg_SH",
    code: "SH",
    name: { fr: "Noisettes", en: "Hazelnuts" },
    categoryId: "alg_cat_tree_nuts",
    official: true,
    archivedAt: null,
  };
}

describe("AllergenEntry", () => {
  it("déclare une entrée maison, jamais officielle, jamais archivée", () => {
    const entry = AllergenEntry.declare({
      id: "ent_1",
      code: " MAISON_NOISETTE ",
      name: { fr: " Noisette torréfiée maison " },
      categoryId: "alg_cat_tree_nuts",
    });

    expect(entry.snapshot()).toEqual({
      id: "ent_1",
      code: "MAISON_NOISETTE",
      name: { fr: "Noisette torréfiée maison" },
      categoryId: "alg_cat_tree_nuts",
      official: false,
      archivedAt: null,
    });
  });

  it("règle libellé et rattachement d'une entrée maison", () => {
    const entry = AllergenEntry.declare({
      id: "ent_1",
      code: "MAISON",
      name: { fr: "Maison" },
      categoryId: "cat_1",
    });

    entry.revise({ name: { fr: "Maison", en: "House" }, categoryId: "cat_2" });

    expect(entry.snapshot()).toMatchObject({
      name: { fr: "Maison", en: "House" },
      categoryId: "cat_2",
    });
  });

  it("laisse le code intact — c'est une identité, pas un réglage", () => {
    const entry = AllergenEntry.declare({
      id: "ent_1",
      code: "MAISON",
      name: { fr: "Maison" },
      categoryId: "cat_1",
    });

    entry.revise({ name: { fr: "Autre nom" } });

    expect(entry.code).toBe("MAISON");
  });

  // `categoryId` absent (donc `undefined`) veut dire « ne touche pas à ça » —
  // pas « efface le libellé ». Un `revise` qui ne règle QUE le rattachement ne
  // doit rien faire au nom, faute de quoi la fiche perdrait sa traduction en
  // ne réglant que la catégorie.
  it("ne touche pas au libellé quand seul le rattachement est réglé", () => {
    const entry = AllergenEntry.declare({
      id: "ent_1",
      code: "MAISON",
      name: { fr: "Maison", en: "House" },
      categoryId: "cat_1",
    });

    entry.revise({ categoryId: "cat_2" });

    expect(entry.snapshot()).toMatchObject({
      name: { fr: "Maison", en: "House" },
      categoryId: "cat_2",
    });
  });

  // Le nettoyage du libellé (`cleanLabel`) doit s'appliquer aussi en cours de
  // vie, pas seulement à la déclaration — sinon un `revise` pourrait poser un
  // libellé sans langue source qu'aucun test de `declare()` ne verrait.
  it("refuse de règler un libellé sans langue source, et ne change rien", () => {
    const entry = AllergenEntry.declare({
      id: "ent_1",
      code: "MAISON",
      name: { fr: "Maison" },
      categoryId: "cat_1",
    });

    expect(() => entry.revise({ name: { fr: "   " } })).toThrow(AllergenLabelRequiredError);
    expect(entry.snapshot().name).toEqual({ fr: "Maison" });
  });

  it("refuse de modifier une entrée officielle", () => {
    const entry = AllergenEntry.reconstitute(officialEntry());

    expect(() => entry.revise({ name: { fr: "Noisette" } })).toThrow(
      OfficialAllergenEntryLockedError,
    );
    expect(() => entry.revise({ categoryId: "cat_maison" })).toThrow(
      OfficialAllergenEntryLockedError,
    );
    expect(entry.snapshot()).toEqual(officialEntry());
  });

  /**
   * Archiver `SH`, c'est le retirer du référentiel réglementaire — donc le
   * supprimer, au sens de la maison. La base le refuse aussi (le trigger gèle
   * `archived_at`), mais l'agrégat doit refuser d'abord : le staff lit un motif
   * métier, pas une `restrict_violation` Postgres.
   */
  it("refuse d'archiver une entrée officielle", () => {
    const entry = AllergenEntry.reconstitute(officialEntry());

    expect(() => entry.archive(NOW)).toThrow(OfficialAllergenEntryLockedError);
    expect(entry.isArchived).toBe(false);
  });

  it("refuse de restaurer une entrée officielle", () => {
    const entry = AllergenEntry.reconstitute(officialEntry());

    expect(() => entry.restore()).toThrow(OfficialAllergenEntryLockedError);
  });

  it("nomme le cas réel et le geste de sortie dans son refus", () => {
    const entry = AllergenEntry.reconstitute(officialEntry());

    expect(() => entry.archive(NOW)).toThrow(/SH.*créez une entrée à vous/su);
  });

  it("archive une entrée maison à l'instant qu'on lui donne", () => {
    const entry = houseEntry();

    entry.archive(NOW);

    expect(entry.isArchived).toBe(true);
    expect(entry.snapshot().archivedAt).toBe(NOW);
  });

  // Idempotent, et la PREMIÈRE date gagne : l'archivage répond à « depuis quand
  // cette entrée n'est plus proposée », pas « depuis le dernier clic ».
  it("garde la date du premier archivage", () => {
    const entry = houseEntry();

    entry.archive(NOW);
    entry.archive(LATER);

    expect(entry.snapshot().archivedAt).toBe(NOW);
  });

  it("remet une entrée maison au référentiel", () => {
    const entry = houseEntry();
    entry.archive(NOW);

    entry.restore();

    expect(entry.isArchived).toBe(false);
    expect(entry.snapshot().archivedAt).toBeNull();
  });

  // La « première date gagne » vaut pour une série d'archivages consécutifs —
  // pas pour l'éternité de l'entrée. Un `restore()` remet le compteur à zéro :
  // le prochain `archive()` répond de nouveau à « depuis quand », et doit donc
  // prendre la date qu'on lui donne, pas rester bloqué sur le premier passage.
  it("reprend une date fraîche pour un nouvel archivage après un restore", () => {
    const entry = houseEntry();

    entry.archive(NOW);
    entry.restore();
    entry.archive(LATER);

    expect(entry.snapshot().archivedAt).toBe(LATER);
  });

  it("fait le tour complet base → agrégat → base", () => {
    const snapshot = officialEntry();

    expect(AllergenEntry.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });
});

function houseEntry(): AllergenEntry {
  return AllergenEntry.declare({
    id: "ent_1",
    code: "MAISON",
    name: { fr: "Maison" },
    categoryId: "cat_1",
  });
}
