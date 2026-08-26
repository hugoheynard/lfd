import { Category } from "../category.js";
import {
  CategoryFrozenError,
  CategorySelfParentError,
  CategoryVatWithoutChannelError,
  CategoryUnknownContextError,
} from "../../errors/category-errors.js";
import type { SalesChannels } from "../../../../shared/domain/value-objects/sales-channels.js";
import type { SalesContext } from "../../../../shared/domain/value-objects/sales-context.js";

/**
 * Le registre, tel que la base le sert. L'agrégat ne l'invente pas : il ne peut
 * pas savoir seul quels contextes existent.
 */
const CONTEXTS: readonly SalesContext[] = [
  {
    id: "ctx_emporter",
    key: "emporter",
    label: "À emporter",
    handleSuffix: "",
    channelKey: "emporter",
    perLocation: true,
    active: true,
    shopifyProjected: true,
    position: 1,
  },
  {
    id: "ctx_sur_place",
    key: "surPlace",
    label: "Sur place",
    handleSuffix: "-surplace",
    channelKey: "surPlace",
    perLocation: true,
    active: true,
    shopifyProjected: false,
    position: 2,
  },
  {
    id: "ctx_b2b",
    key: "b2b",
    label: "B2B",
    handleSuffix: "-b2b",
    channelKey: "b2b",
    perLocation: false,
    active: true,
    shopifyProjected: false,
    position: 3,
  },
];

const OPEN = { id: "cat_1", name: { fr: "Chocolats fins" }, parentId: null, position: 0 };

/** Une grille de canaux : un ENSEMBLE DE PAIRES (lieu, contexte). */
function channels(sold: SalesChannels = []): SalesChannels {
  return sold;
}

/** Une famille qui vend le mode demandé, prête à porter un taux. */
function selling(sold: SalesChannels): Category {
  const category = Category.open(OPEN);
  category.setChannels(channels(sold), CONTEXTS);
  return category;
}

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
        archived().setChannels(
          channels([
            { locationId: "emp_1", context: "emporter" },
            { locationId: "emp_1", context: "surPlace" },
          ]),
          CONTEXTS,
        ),
      ).toThrow(CategoryFrozenError);
    });

    it("refuse la TVA", () => {
      expect(() => archived().setVat({ emporter: "tva_5" }, CONTEXTS)).toThrow(CategoryFrozenError);
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
    expect(snapshot.vatByContext).toEqual({});
    // Une carte VIDE, pas deux boutiques à zéro : les emplacements sont une
    // donnée, et une famille neuve n'en coche aucun.
    expect(snapshot.channelPreset).toEqual([]);
  });

  it("se reconstitue à l’identique depuis son instantané", () => {
    const snapshot = Category.open(OPEN).snapshot();
    expect(Category.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });

  /**
   * La règle vivait dans le navigateur : le panneau envoyait les canaux, PUIS
   * les taux nettoyés, en deux requêtes sans transaction. La seconde perdue
   * laissait une famille qui ne vend plus en B2B et pointe toujours son taux.
   */
  describe("un taux ne se règle que pour un canal vendu", () => {
    it("refuse le taux d’un canal fermé", () => {
      const category = selling([{ locationId: "emp_1", context: "emporter" }]);
      expect(() => category.setVat({ emporter: "tva_55", surPlace: "tva_10" }, CONTEXTS)).toThrow(
        CategoryVatWithoutChannelError,
      );
    });

    it("accepte le taux d’un canal vendu, quelle que soit la boutique", () => {
      const category = selling([{ locationId: "emp_1", context: "emporter" }]);
      category.setVat({ emporter: "tva_55" }, CONTEXTS);
      expect(category.vatByContext).toEqual({ emporter: "tva_55" });
    });

    it("traite le B2B comme un canal à part entière", () => {
      const category = selling([{ locationId: null, context: "b2b" }]);
      category.setVat({ b2b: "tva_55" }, CONTEXTS);
      expect(category.vatOf("b2b")).toBe("tva_55");
    });

    it("EFFACE le taux d’un canal qu’on ferme", () => {
      const category = selling([{ locationId: null, context: "b2b" }]);
      category.setVat({ b2b: "tva_55" }, CONTEXTS);

      category.setChannels(channels([]), CONTEXTS);

      expect(category.vatOf("b2b")).toBeNull();
    });

    it("laisse intact le taux d’un canal qui reste vendu", () => {
      const category = selling([{ locationId: "emp_1", context: "emporter" }]);
      category.setVat({ emporter: "tva_55" }, CONTEXTS);

      // Une SECONDE boutique ouvre ; « à emporter » se vend toujours.
      category.setChannels(
        channels([
          { locationId: "emp_1", context: "emporter" },
          { locationId: "emp_2", context: "emporter" },
        ]),
        CONTEXTS,
      );

      expect(category.vatOf("emporter")).toBe("tva_55");
    });

    it("refuse un contexte que le registre ne connaît pas", () => {
      // Accepter la clé la persisterait sans ligne de registre en face, et
      // personne ne saurait plus dire, six mois après, ce que « traiteur »
      // facturait.
      const category = selling([{ locationId: "emp_1", context: "emporter" }]);
      expect(() => category.setVat({ traiteur: "tva_10" }, CONTEXTS)).toThrow(
        CategoryUnknownContextError,
      );
    });
  });
});
