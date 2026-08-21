import { Category } from "../category.js";
import { CategoryFrozenError, CategorySelfParentError } from "../../errors/category-errors.js";

const OPEN = { id: "cat_1", name: { fr: "Chocolats fins" }, parentId: null, position: 0 };

describe("l’agrégat Category", () => {
  describe("le slug suit le nom, toujours", () => {
    it("le dérive à l’ouverture", () => {
      expect(Category.open(OPEN).slug.fr).toBe("chocolats-fins");
    });

    /**
     * La raison d'être de l'agrégat : le slug était re-dérivé à la main par
     * chaque appelant. Ici, il n'y a plus de main.
     */
    it("le re-dérive au renommage, sans qu’on le lui demande", () => {
      const category = Category.open(OPEN);
      category.rename({ fr: "Chocolats & pralinés" });
      expect(category.slug.fr).toBe("chocolats-pralines");
    });

    it("suit les deux langues quand elles sont là", () => {
      const category = Category.open(OPEN);
      category.rename({ fr: "Thés d’été", en: "Summer teas" });
      expect(category.slug).toEqual({ fr: "thes-d-ete", en: "summer-teas" });
    });
  });

  describe("une famille n’est jamais sa propre parente", () => {
    it("refuse à l’ouverture", () => {
      expect(() => Category.open({ ...OPEN, parentId: OPEN.id })).toThrow(CategorySelfParentError);
    });

    it("refuse au déplacement", () => {
      const category = Category.open(OPEN);
      expect(() => category.moveUnder(OPEN.id, 0)).toThrow(CategorySelfParentError);
    });
  });

  describe("archivée = gelée, sauf le nom", () => {
    const archived = (): Category => {
      const category = Category.open(OPEN);
      category.archive();
      return category;
    };

    it("refuse les canaux", () => {
      expect(() =>
        archived().setChannels({
          b1: { emporter: true, surPlace: true },
          b2: { emporter: false, surPlace: false },
        }),
      ).toThrow(CategoryFrozenError);
    });

    it("refuse la TVA", () => {
      expect(() => archived().setTva("tva_5", null)).toThrow(CategoryFrozenError);
    });

    it("refuse le déplacement et le rang", () => {
      expect(() => archived().moveUnder("cat_2", 0)).toThrow(CategoryFrozenError);
      expect(() => archived().placeAt(3)).toThrow(CategoryFrozenError);
    });

    it("laisse renommer — une faute de frappe se corrige sans ressusciter", () => {
      const category = archived();
      category.rename({ fr: "Chocolats" });
      expect(category.name.fr).toBe("Chocolats");
    });

    it("archiver deux fois n’est pas une erreur : c’est l’état visé", () => {
      const category = archived();
      expect(() => category.archive()).not.toThrow();
      expect(category.isArchived).toBe(true);
    });
  });

  it("naît vivante, sans canal vendu ni TVA réglée", () => {
    const snapshot = Category.open(OPEN).snapshot();
    expect(snapshot.isArchived).toBe(false);
    expect(snapshot.emporterTvaId).toBeNull();
    expect(snapshot.surPlaceTvaId).toBeNull();
    expect(snapshot.channelPreset).toEqual({
      b1: { emporter: false, surPlace: false },
      b2: { emporter: false, surPlace: false },
    });
  });

  it("se reconstitue à l’identique depuis son instantané", () => {
    const snapshot = Category.open(OPEN).snapshot();
    expect(Category.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });
});
