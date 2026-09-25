import {
  ArchivedProductNotPublishableError,
  ArchivedProductNotWithdrawableError,
  InvalidProductVariantsError,
  InvalidVariantPricingError,
  NotArchivedProductNotRestorableError,
  ProductNotPublishableError,
  VariantNotFoundError,
} from "../../errors/product-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product, type ProductSnapshot } from "../product.js";
import type { VariantNutritionSnapshot } from "../variant.js";

const open = (): Product =>
  Product.open({
    id: "prod_1",
    sku: Sku.create("PATI-TARTE"),
    name: { fr: "Tarte aux fraises" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: { id: "var_1", sku: Sku.create("PATI-TARTE-1"), name: { fr: "6 parts" } },
  });

/** Un instantané valide qu'on abîme au cas par cas. */
const snapshotWith = (variants: ProductSnapshot["variants"]): ProductSnapshot => ({
  ...open().snapshot(),
  variants,
});

/**
 * Un produit dont les déclinaisons portent (ou non) une fiche réglementaire.
 * La première reste celle par défaut ; les suivantes sont ajoutées à
 * l'instantané, seul chemin possible tant qu'`AddVariant` n'existe pas.
 */
function declared(
  variants: readonly {
    allergens: readonly string[] | null;
    /** Les valeurs de la déclinaison — indépendantes des allergènes (D2). */
    nutrition?: VariantNutritionSnapshot | null;
    isDiscontinued?: boolean;
  }[],
): Product {
  const [template] = open().snapshot().variants;
  return Product.reconstitute(
    snapshotWith(
      variants.map((variant, index) => ({
        ...template!,
        id: `var_${String(index + 1)}`,
        sku: `PATI-TARTE-${String(index + 1)}`,
        isDefault: index === 0,
        isDiscontinued: variant.isDiscontinued ?? false,
        // Le DSL du test parle encore en codes ; l'instantané, lui, porte la
        // déclaration entière depuis le lot 7 — traces comprises.
        allergenSheet:
          variant.allergens === null ? null : { declared: variant.allergens, mayContain: [] },
        nutrition: variant.nutrition ?? null,
      })),
    ),
  );
}

describe("l’agrégat Product", () => {
  describe("invariant 2 : une déclinaison au moins, une par défaut exactement", () => {
    it("naît avec sa déclinaison par défaut", () => {
      const snapshot = open().snapshot();
      expect(snapshot.variants).toHaveLength(1);
      expect(snapshot.variants[0]?.isDefault).toBe(true);
    });

    it("refuse de reconstituer un produit sans déclinaison", () => {
      expect(() => Product.reconstitute(snapshotWith([]))).toThrow(InvalidProductVariantsError);
    });

    it("refuse de reconstituer un produit sans déclinaison par défaut", () => {
      const [only] = open().snapshot().variants;
      expect(() => Product.reconstitute(snapshotWith([{ ...only!, isDefault: false }]))).toThrow(
        InvalidProductVariantsError,
      );
    });

    it("refuse deux déclinaisons par défaut", () => {
      const [only] = open().snapshot().variants;
      expect(() =>
        Product.reconstitute(snapshotWith([only!, { ...only!, id: "var_2", sku: "X-2" }])),
      ).toThrow(InvalidProductVariantsError);
    });
  });

  describe("le slug suit le nom", () => {
    it("le dérive à l’ouverture", () => {
      expect(open().snapshot().slug.fr).toBe("tarte-aux-fraises");
    });

    it("le re-dérive au renommage", () => {
      const product = open();
      product.rename({ fr: "Tarte fraises & basilic" });
      expect(product.snapshot().slug.fr).toBe("tarte-fraises-basilic");
    });
  });

  describe("le cycle de vie", () => {
    it("naît invisible — c’est ce qui rend l’invariant 7 tenable", () => {
      expect(open().status).toBe("draft");
    });

    it("s’archive et se restaure EN BROUILLON, jamais directement en ligne", () => {
      const product = open();
      product.archive();
      expect(product.status).toBe("archived");
      product.restore();
      expect(product.status).toBe("draft");
    });

    it("archiver deux fois n’est pas une erreur", () => {
      const product = open();
      product.archive();
      expect(() => product.archive()).not.toThrow();
    });

    /**
     * Régression : `restore()` posait `draft` sans regarder d'où il venait. Un
     * produit EN LIGNE qu'on « restaurait » sortait donc de la vente en silence.
     */
    it("REFUSE de restaurer ce qui n’est pas archivé — un produit en ligne y perdait sa vente", () => {
      const product = declared([{ allergens: ["gluten"] }]);
      product.publish();
      expect(() => product.restore()).toThrow(NotArchivedProductNotRestorableError);
      expect(product.status).toBe("published");
    });

    it("REFUSE de restaurer un brouillon — il n’y a rien à restaurer", () => {
      expect(() => open().restore()).toThrow(NotArchivedProductNotRestorableError);
    });

    /**
     * Le booléen est ce qui permet aux handlers de ne PAS journaliser un
     * non-événement : trois des quatre traçaient inconditionnellement, si bien
     * que le journal d'audit portait des retraits de la vente qui n'avaient pas
     * eu lieu (audit 2026-09-01).
     */
    it("dit ce qu’il a fait : vrai quand l’état bouge, faux quand il y était déjà", () => {
      const product = declared([{ allergens: ["gluten"] }]);
      expect(product.publish()).toBe(true);
      expect(product.publish()).toBe(false);
      expect(product.unpublish()).toBe(true);
      expect(product.unpublish()).toBe(false);
      expect(product.archive()).toBe(true);
      expect(product.archive()).toBe(false);
      expect(product.restore()).toBe(true);
    });

    it("republier ne re-vérifie pas les fiches : rien ne change, donc rien ne peut échouer", () => {
      const product = declared([{ allergens: ["gluten"] }]);
      product.publish();
      expect(() => product.publish()).not.toThrow();
      expect(product.status).toBe("published");
    });
  });

  describe("invariant 7 : on ne met pas en vente ce qu’on ne peut pas étiqueter", () => {
    /** Le produit tel qu'il naît : aucune fiche renseignée. */
    it("refuse de publier tant qu’une déclinaison active n’a pas de fiche", () => {
      expect(() => open().publish()).toThrow(ProductNotPublishableError);
    });

    it("nomme les références en cause plutôt que de dire « non »", () => {
      expect(() => open().publish()).toThrow("PATI-TARTE-1");
    });

    it("publie dès que chaque déclinaison active est étiquetée", () => {
      const product = declared([{ allergens: ["gluten"] }]);
      product.publish();
      expect(product.status).toBe("published");
    });

    /**
     * `[]` n'est pas une absence de réponse : c'est « aucun allergène », une
     * affirmation positive. La confondre avec `null` interdirait de publier
     * tout ce qui n'en contient pas.
     */
    it("traite « aucun allergène » comme une fiche déclarée", () => {
      const product = declared([{ allergens: [] }]);
      product.publish();
      expect(product.status).toBe("published");
    });

    /** Une déclinaison arrêtée ne part chez aucun canal : elle ne compte pas. */
    it("ignore les déclinaisons arrêtées", () => {
      const product = declared([
        { allergens: ["gluten"] },
        { allergens: null, isDiscontinued: true },
      ]);
      product.publish();
      expect(product.status).toBe("published");
    });

    it("refuse de publier un produit archivé — le restaurer d’abord", () => {
      const product = declared([{ allergens: ["gluten"] }]);
      product.archive();
      expect(() => product.publish()).toThrow(ArchivedProductNotPublishableError);
    });
  });

  /**
   * 🔴 **L'invariant 7 s'écrit sur les ALLERGÈNES seuls** — lot 5 du plan
   * `plan-separer-allergenes-et-nutrition.md` (D2, D3).
   *
   * Ce n'est pas un desserrage. Le règlement (UE) n° 1169/2011 rend les
   * allergènes obligatoires (art. 9 §1 point c) et exempte la déclaration
   * nutritionnelle (point l) dans les deux cas de vente de La Folie Coffee : le
   * frais non préemballé en boutique par l'art. 44 §1, les confiseries par
   * l'annexe V pt 19. Exiger les deux revenait à exiger ce que le règlement
   * n'exige pas — et à bloquer en saisie un catalogue entier.
   *
   * Les deux cas qui portent tout le lot sont ici, et ils sont symétriques.
   */
  describe("invariant 7 : les allergènes seuls, jamais les valeurs", () => {
    /** Les sept valeurs de l'annexe XV et l'indice, toutes à `null`. */
    const NO_VALUES = {
      energyKcal: null,
      fatG: null,
      saturatedFatG: null,
      carbsG: null,
      sugarsG: null,
      proteinG: null,
      saltG: null,
      glycemicIndex: null,
    } as const;

    /**
     * 🔴 Cas 1 — **des allergènes, aucune valeur nutritionnelle : ça se
     * publie.** C'est le cas NORMAL en boutique, et c'est celui que l'ancienne
     * règle refusait.
     */
    it("publie une déclinaison qui déclare ses allergènes et AUCUNE valeur", () => {
      const product = declared([{ allergens: ["gluten"], nutrition: null }]);

      product.publish();

      expect(product.status).toBe("published");
    });

    /** Même chose avec l'affirmation « aucun allergène » : elle suffit seule. */
    it("publie sur « aucun allergène » sans le moindre tableau nutritionnel", () => {
      const product = declared([{ allergens: [], nutrition: null }]);

      product.publish();

      expect(product.status).toBe("published");
    });

    /**
     * 🔴 Cas 2 — **des valeurs, aucune déclaration d'allergène : refusé**, et
     * c'est l'état nommé de D3. Un tableau nutritionnel se copie d'un document ;
     * la déclaration d'allergène demande de regarder la recette. Laisser publier
     * ce cas-là mettrait en vente un article non étiqueté qui a pourtant l'air
     * renseigné.
     */
    it("refuse des valeurs nutritionnelles sans déclaration d’allergène", () => {
      const product = declared([
        { allergens: null, nutrition: { ...NO_VALUES, energyKcal: 410, saltG: 2 } },
      ]);

      expect(() => product.publish()).toThrow(ProductNotPublishableError);
      expect(product.status).toBe("draft");
    });

    /** Et le refus NOMME la référence : le back-office lit ce message seul. */
    it("nomme la référence en cause et le geste de sortie", () => {
      const product = declared([{ allergens: null, nutrition: { ...NO_VALUES, energyKcal: 410 } }]);

      expect(() => product.publish()).toThrow("PATI-TARTE-1");
      expect(() => product.publish()).toThrow(/Allergènes/);
    });

    /**
     * Une seule déclinaison muette suffit à refuser, et c'est elle qu'on nomme
     * — pas celle qui est en règle. Un produit à six déclinaisons se corrige
     * autrement.
     */
    it("ne nomme que les déclinaisons réellement muettes", () => {
      const product = declared([
        { allergens: ["gluten"] },
        { allergens: null, nutrition: { ...NO_VALUES, saltG: 2 } },
      ]);

      expect(() => product.publish()).toThrow("PATI-TARTE-2");
      expect(() => product.publish()).not.toThrow(/PATI-TARTE-1/);
    });
  });

  describe("dépublier", () => {
    it("ramène en brouillon, pas aux archives", () => {
      const product = declared([{ allergens: [] }]);
      product.publish();
      product.unpublish();
      expect(product.status).toBe("draft");
    });

    /**
     * Le produit reste archivé — c'est l'invariant, et il n'a pas changé. Ce
     * qui a changé, c'est qu'il le dit maintenant au lieu de se taire.
     *
     * Régression : le back-office envoyait sa demande de RESTAURATION sur cette
     * route (`changeStatus('draft')` → `unpublishProduct`). Le no-op était donc
     * indiscernable d'un succès — l'écran peignait « Brouillon », le handler
     * journalisait un retrait de la vente, la base restait archivée, et comme
     * la liste n'offre pas la restauration, archiver était devenu irréversible
     * depuis l'interface (audit 2026-09-01, §1).
     */
    it("REFUSE de réveiller un produit archivé, au lieu de se taire", () => {
      const product = open();
      product.archive();
      expect(() => product.unpublish()).toThrow(ArchivedProductNotWithdrawableError);
      expect(product.status).toBe("archived");
    });

    it("sur un brouillon, ne fait rien — et le DIT, pour que rien ne soit journalisé", () => {
      const product = open();
      expect(product.unpublish()).toBe(false);
      expect(product.status).toBe("draft");
    });
  });

  describe("le tarif d’une déclinaison", () => {
    it("s’applique à une déclinaison du produit", () => {
      const product = open();
      product.priceVariant("var_1", { priceCents: 1250, weightGrams: 480 });
      expect(product.snapshot().variants[0]?.priceCents).toBe(1250);
      expect(product.snapshot().variants[0]?.weightGrams).toBe(480);
    });

    /** Sans cette garde, une requête forgée tarifait la variante d’un autre. */
    it("refuse une déclinaison qui n’est pas la sienne", () => {
      expect(() =>
        open().priceVariant("var_dautrui", {
          priceCents: 100,
          weightGrams: null,
        }),
      ).toThrow(VariantNotFoundError);
    });

    it("accepte de dé-tarifer (null)", () => {
      const product = open();
      product.priceVariant("var_1", { priceCents: 1250, weightGrams: 480 });
      product.priceVariant("var_1", { priceCents: null, weightGrams: null });
      expect(product.snapshot().variants[0]?.priceCents).toBeNull();
    });

    /**
     * La route HTTP exigeait déjà `int().min(0)`, le domaine non : un seed ou
     * un import passait à côté, et un demi-centime partait chez Shopify.
     */
    it.each([
      ["un prix négatif", -1, null],
      ["un prix fractionnaire", 12.5, null],
      ["un poids négatif", null, -3],
      ["un poids fractionnaire", null, 1.5],
    ])("refuse %s", (_label, priceCents, weightGrams) => {
      expect(() =>
        open().priceVariant("var_1", {
          priceCents: priceCents,
          weightGrams: weightGrams,
        }),
      ).toThrow(InvalidVariantPricingError);
    });
  });

  it("dit ce qui lui appartient, pour les verbes qui écrivent ailleurs", () => {
    const product = open();
    expect(() => product.requireVariant("var_1")).not.toThrow();
    expect(() => product.requireVariant("var_dautrui")).toThrow(VariantNotFoundError);
  });

  it("se reconstitue à l’identique depuis son instantané", () => {
    const snapshot = open().snapshot();
    expect(Product.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });
});

describe("réservée aux opérations datées (D3)", () => {
  it("naît courante : réserver une fiche est une décision qu'on prend en le sachant", () => {
    expect(open().snapshot().operationOnly).toBe(false);
  });

  it("se réserve, et dit qu'elle a changé", () => {
    const product = open();

    expect(product.reserveForOperations(true)).toBe(true);
    expect(product.snapshot().operationOnly).toBe(true);
    expect(product.persistenceSnapshot().operationOnly).toBe(true);
  });

  it("ne dit rien changé quand elle y était déjà — pas de fait à journaliser", () => {
    const product = open();
    product.reserveForOperations(true);

    expect(product.reserveForOperations(true)).toBe(false);
  });

  it("se réserve même archivée : Noël se prépare sur des fiches qu'on ne vend pas encore", () => {
    const product = open();
    product.archive();

    expect(product.reserveForOperations(true)).toBe(true);
  });

  it("garde le drapeau à la reconstitution", () => {
    const product = open();
    product.reserveForOperations(true);

    expect(Product.reconstitute(product.snapshot()).operationOnly).toBe(true);
  });
});
