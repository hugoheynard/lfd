import { Category } from "../category.js";
import {
  CategoryFrozenError,
  CategorySelfParentError,
  CategoryUnknownContextError,
} from "../../errors/category-errors.js";
import type { SalesContext } from "../../../../../sales-contexts/domain/value-objects/sales-context.js";

/**
 * Le registre, tel que la base le sert. L'agrégat ne l'invente pas : il ne peut
 * pas savoir seul quels contextes existent.
 */
const CONTEXTS: readonly SalesContext[] = [
  {
    id: "ctx_emporter",
    key: "takeaway",
    label: "À emporter",
    active: true,
    position: 1,
  },
  {
    id: "ctx_sur_place",
    key: "eatIn",
    label: "Sur place",
    active: true,
    position: 2,
  },
  {
    id: "ctx_b2b",
    key: "b2b",
    label: "B2B",
    active: true,
    position: 3,
  },
];

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

    it("refuse la TVA", () => {
      expect(() => archived().setVat({ takeaway: "tva_5" }, CONTEXTS)).toThrow(CategoryFrozenError);
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

  it("naît vivante, sans TVA réglée", () => {
    const snapshot = Category.open(OPEN).snapshot();
    expect(snapshot.isArchived).toBe(false);
    expect(snapshot.vatByContext).toEqual({});
  });

  it("se reconstitue à l’identique depuis son instantané", () => {
    const snapshot = Category.open(OPEN).snapshot();
    expect(Category.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });

  /**
   * La TVA ne dépend plus des canaux (Hugo, 2026-10-15) : une famille doit
   * pouvoir servir n'importe quel contexte, vendu aujourd'hui ou non.
   */
  describe("un taux se règle pour tout contexte connu, vendu ou non", () => {
    /** Régression : `refuseVatWithoutChannel` refusait ce geste jusqu'au 2026-10-15. */
    it("un taux se pose pour un contexte que la famille ne vend pas", () => {
      const category = Category.open(OPEN);
      category.setVat({ takeaway: "tva_55", eatIn: "tva_10" }, CONTEXTS);
      expect(category.vatByContext).toEqual({ takeaway: "tva_55", eatIn: "tva_10" });
    });

    it("traite le B2B comme un contexte à part entière", () => {
      const category = Category.open(OPEN);
      category.setVat({ b2b: "tva_55" }, CONTEXTS);
      expect(category.vatOf("b2b")).toBe("tva_55");
    });

    it("refuse un contexte que le registre ne connaît pas", () => {
      // Accepter la clé la persisterait sans ligne de registre en face, et
      // personne ne saurait plus dire, six mois après, ce que « traiteur »
      // facturait.
      const category = Category.open(OPEN);
      expect(() => category.setVat({ traiteur: "tva_10" }, CONTEXTS)).toThrow(
        CategoryUnknownContextError,
      );
    });
  });

  describe("l’audience — à qui la famille vend", () => {
    it("naît à `both` : c’est ce que faisait toute famille avant l’audience", () => {
      expect(Category.open(OPEN).audience).toBe("both");
    });

    it("change, et le dit ; ne dit rien quand rien ne change", () => {
      const category = Category.open(OPEN);
      expect(category.changeAudience("pro")).toBe(true);
      expect(category.snapshot().audience).toBe("pro");
      expect(category.changeAudience("pro")).toBe(false);
    });

    it("est gelée sur une famille archivée, comme ses autres réglages", () => {
      const category = Category.open(OPEN);
      category.archive();
      expect(() => category.changeAudience("public")).toThrow(CategoryFrozenError);
      expect(category.audience).toBe("both");
    });

    it("survit à la reconstitution", () => {
      const category = Category.open(OPEN);
      category.changeAudience("public");
      expect(Category.reconstitute(category.snapshot()).audience).toBe("public");
    });
  });
});
