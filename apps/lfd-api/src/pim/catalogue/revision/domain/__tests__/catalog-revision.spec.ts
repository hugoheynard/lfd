import { CatalogRevision } from "../entities/catalog-revision.js";
import { RevisionAlreadyNamedError } from "../errors/revision-errors.js";

const TAKING = {
  id: "rev_1",
  reference: "R-AAAAAA",
  hash: "empreinte",
  takenAt: new Date("2026-01-01T09:00:00.000Z"),
  takenBy: "staff_1",
};

describe("CatalogRevision", () => {
  it("se pose sans article compté", () => {
    const revision = CatalogRevision.take({ ...TAKING, label: null, note: null });

    expect(revision.isNamed).toBe(false);
    expect(revision.toState().articles).toBe(0);
  });

  it("nomme une ancre muette, et garde la note qu'on n'apporte pas", () => {
    const revision = CatalogRevision.rehydrate({
      ...TAKING,
      label: null,
      note: "écrite par une autre main",
      articles: 4,
    });

    revision.name("Catalogue de la rentrée", null);

    expect(revision.toState()).toMatchObject({
      label: "Catalogue de la rentrée",
      note: "écrite par une autre main",
      articles: 4,
    });
  });

  it("écrit la note quand on en apporte une", () => {
    const revision = CatalogRevision.take({ ...TAKING, label: null, note: null });

    revision.name("Rentrée", "Après le changement de taux");

    expect(revision.note).toBe("Après le changement de taux");
  });

  it("refuse de renommer une ancre déjà nommée, et ne change rien", () => {
    const revision = CatalogRevision.take({ ...TAKING, label: "Premier nom", note: null });

    expect(() => revision.name("Autre nom", "autre note")).toThrow(RevisionAlreadyNamedError);
    expect(revision.label).toBe("Premier nom");
    expect(revision.note).toBeNull();
  });

  it("nomme le cas réel dans le refus", () => {
    const revision = CatalogRevision.take({ ...TAKING, label: "Premier nom", note: null });

    expect(() => revision.name("Autre", null)).toThrow(/R-AAAAAA.*Premier nom.*ne se renomme pas/);
  });
});
