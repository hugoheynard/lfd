import {
  DefaultVariantCannotFollowItselfError,
  ProductNotPublishableError,
  VariantNotFoundError,
  VariantNotInProductError,
} from "../../errors/product-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";
import type { VariantNutritionValues } from "../variant.js";

/** Les huit valeurs à vide — `null` = non renseigné, jamais zéro. */
const BLANK: VariantNutritionValues = {
  energyKcal: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  sugarsG: null,
  proteinG: null,
  saltG: null,
  glycemicIndex: null,
};

/**
 * Ce que ces cas tiennent : **une déclinaison alignée est étiquetable**.
 *
 * L'invariant 7 refuse de mettre en vente une déclinaison active sans fiche
 * réglementaire — c'est la bonne règle, et c'est aussi ce qui rendait une
 * déclinaison de plus impossible à ajouter sans retaper les allergènes. L'aligner
 * sur celle par défaut est la réponse ; encore faut-il que l'invariant sache la
 * lire, sans quoi on aurait déplacé le blocage sans le lever.
 *
 * L'autre moitié du sujet est ce qui SORT de l'agrégat : la projection, la
 * révision et le rapport de parité lisent tous `snapshot()`, et une déclinaison
 * alignée qui en sortirait avec `allergens: null` partirait au canal comme non
 * déclarée — que le récepteur ne doit surtout pas lire « sans allergène ».
 */

function aProduct(): Product {
  return Product.open({
    id: "prd_1",
    sku: Sku.create("CHO-001"),
    name: { fr: "Gros florentin lait" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: {
      id: "var_1",
      sku: Sku.create("CHO-001-1"),
      name: { fr: "Gros florentin lait" },
    },
  });
}

/** Déclare la fiche du DÉFAUT — le seul chemin, l'agrégat ne la fabrique pas. */
function withDefaultDeclared(product: Product): Product {
  const snapshot = product.snapshot();
  const [first, ...rest] = snapshot.variants;
  return Product.reconstitute({
    ...snapshot,
    variants: [{ ...first!, allergens: ["AM"], nutrition: null }, ...rest],
  });
}

function addVariant(product: Product, sku = "CHO-001-2"): string {
  return product.addVariant({
    id: "var_2",
    sku: Sku.create(sku),
    name: { fr: "Boîte de 220 g" },
    options: { poids: "220 g" },
  }).id;
}

describe("déclarer les allergènes met l'agrégat à jour", () => {
  /**
   * 🔴 Régression structurelle. La fiche s'écrivait par un port SANS jamais
   * repasser par l'agrégat : `hasOwnRegulatorySheet` continuait donc de
   * répondre sur l'état d'AVANT, et `isCovered` avec lui.
   *
   * Rien n'en dépendait dans le même geste — mais l'invariant 7 se juge sur cet
   * état, et il le lit juste après avoir déclaré
   * (`plan-separer-allergenes-et-nutrition.md`).
   */
  it("la déclinaison est couverte AUSSITÔT, sans relecture", () => {
    const product = aProduct();
    const [variant] = product.snapshot().variants;

    expect(() => product.publish()).toThrow(ProductNotPublishableError);

    product.declareAllergens(variant!.id, { allergens: ["AM"], mayContain: [] });

    expect(() => product.publish()).not.toThrow();
  });

  /** `[]` compte comme déclaré — c'est une affirmation, pas un silence. */
  it("« aucun allergène » couvre aussi", () => {
    const product = aProduct();
    const [variant] = product.snapshot().variants;

    product.declareAllergens(variant!.id, { allergens: [], mayContain: [] });

    expect(() => product.publish()).not.toThrow();
  });
});

/**
 * 🔴 **Les deux moitiés ne se touchent plus** — la promesse entière du plan
 * `plan-separer-allergenes-et-nutrition.md`, vue de l'agrégat.
 *
 * Une seule requête remplaçait les deux : celui qui écrivait l'une devait
 * renvoyer l'autre, et l'oublier l'effaçait. Sur les allergènes, l'oublier
 * revenait à affirmer « aucun » (bug 0c), sur de la donnée d'étiquette.
 */
describe("déclarer une moitié laisse l’autre intacte", () => {
  it("enregistrer les valeurs ne fabrique AUCUNE affirmation d’allergène", () => {
    const product = aProduct();
    const [variant] = product.snapshot().variants;

    product.declareNutritionValues(variant!.id, { ...BLANK, saltG: 2 });

    const after = product.snapshot().variants[0];
    // `null` et non `[]` : personne ne s'est prononcé, et l'invariant 7 le voit.
    expect(after?.allergens).toBeNull();
    expect(after?.nutrition?.saltG).toBe(2);
    expect(() => product.publish()).toThrow(ProductNotPublishableError);
  });

  it("enregistrer les allergènes n’efface pas les valeurs", () => {
    const product = aProduct();
    const [variant] = product.snapshot().variants;
    product.declareNutritionValues(variant!.id, { ...BLANK, saltG: 2, energyKcal: 410 });

    product.declareAllergens(variant!.id, { allergens: ["AM"], mayContain: ["GB"] });

    const after = product.snapshot().variants[0];
    expect(after?.allergens).toEqual(["AM"]);
    expect(after?.nutrition).toMatchObject({ saltG: 2, energyKcal: 410, mayContain: ["GB"] });
  });

  it("enregistrer les valeurs n’efface pas les traces", () => {
    const product = aProduct();
    const [variant] = product.snapshot().variants;
    product.declareAllergens(variant!.id, { allergens: [], mayContain: ["GB"] });

    product.declareNutritionValues(variant!.id, { ...BLANK, saltG: 2 });

    const after = product.snapshot().variants[0];
    expect(after?.allergens).toEqual([]);
    expect(after?.nutrition?.mayContain).toEqual(["GB"]);
  });

  it("refuse une déclinaison qui n’est pas du produit", () => {
    const product = aProduct();

    expect(() =>
      product.declareAllergens("var_etranger", { allergens: [], mayContain: [] }),
    ).toThrow(VariantNotFoundError);
    expect(() => product.declareNutritionValues("var_etranger", BLANK)).toThrow(
      VariantNotFoundError,
    );
  });
});

describe("une déclinaison ajoutée naît alignée", () => {
  it("prend le rang suivant, sans tarif", () => {
    const product = aProduct();

    addVariant(product);

    const added = product.snapshot().variants[1];
    expect(added).toMatchObject({
      sku: "CHO-001-2",
      isDefault: false,
      position: 1,
      // Une seconde déclinaison existe parce qu'elle se vend AUTREMENT : lui
      // recopier le prix du défaut inventerait une décision commerciale.
      priceCents: null,
      regulatoryFollowsDefault: true,
      pricingFollowsDefault: false,
    });
  });

  /** Le rang, pas le compte : un rang retiré du milieu ne se réutilise pas. */
  it("ne réutilise pas le rang d’une déclinaison retirée", () => {
    const product = aProduct();
    addVariant(product);

    expect(product.nextVariantPosition).toBe(2);
  });
});

describe("l’invariant 7 lit l’alignement", () => {
  it("met en vente une fiche dont la seconde déclinaison suit le défaut", () => {
    const product = withDefaultDeclared(aProduct());
    addVariant(product);

    expect(() => product.publish()).not.toThrow();
  });

  /**
   * 🔴 Le cas qui compte. Aligner ne fabrique pas une déclaration : si le défaut
   * n'en porte aucune, la suivre ne couvre rien — et la fiche reste refusée.
   * Sans ce refus, l'alignement serait une porte pour publier un catalogue
   * entier sans jamais écrire un allergène.
   */
  it("refuse quand le défaut lui-même ne déclare rien", () => {
    const product = aProduct();
    addVariant(product);

    expect(() => product.publish()).toThrow(ProductNotPublishableError);
  });

  it("refuse une déclinaison détachée qui ne déclare rien", () => {
    const product = withDefaultDeclared(aProduct());
    const variantId = addVariant(product);

    product.alignVariant(variantId, "regulatory", false);

    expect(() => product.publish()).toThrow(ProductNotPublishableError);
  });
});

describe("le tarif s’aligne aussi, et ne s’aligne PAS d’office", () => {
  /**
   * Une seconde déclinaison existe le plus souvent parce qu'elle se vend
   * autrement. Naître alignée sur le prix du défaut ferait facturer un montant
   * que personne n'a décidé — et un prix faux, lui, part sur la facture.
   */
  it("naît avec son propre tarif, pas celui du défaut", () => {
    const product = withDefaultDeclared(aProduct());

    addVariant(product);

    expect(product.snapshot().variants[1]).toMatchObject({
      pricingFollowsDefault: false,
      priceCents: null,
    });
  });

  it("prend prix ET poids du défaut une fois aligné", () => {
    const product = Product.reconstitute({
      ...aProduct().snapshot(),
      variants: [{ ...aProduct().snapshot().variants[0]!, priceCents: 250, weightGrams: 100 }],
    });
    const variantId = addVariant(product);

    product.alignVariant(variantId, "pricing", true);

    // Les deux ENSEMBLE : un prix hérité au-dessus d'un poids propre décrirait
    // un article que personne ne vend.
    expect(product.snapshot().variants[1]).toMatchObject({
      priceCents: 250,
      weightGrams: 100,
    });
  });

  it("refuse que le défaut suive son propre tarif", () => {
    const product = aProduct();

    expect(() => product.alignVariant("var_1", "pricing", true)).toThrow(
      DefaultVariantCannotFollowItselfError,
    );
  });

  /** Les deux sections sont indépendantes : suivre l'étiquette n'est pas suivre le prix. */
  it("aligne une section sans toucher à l’autre", () => {
    const product = withDefaultDeclared(aProduct());
    const variantId = addVariant(product);

    product.alignVariant(variantId, "regulatory", false);

    expect(product.snapshot().variants[1]).toMatchObject({
      regulatoryFollowsDefault: false,
      pricingFollowsDefault: false,
    });
  });
});

describe("l’instantané résout l’héritage", () => {
  it("sort une déclinaison alignée avec les allergènes du défaut", () => {
    const product = withDefaultDeclared(aProduct());
    addVariant(product);

    expect(product.snapshot().variants[1]?.allergens).toEqual(["AM"]);
  });

  it("laisse une déclinaison détachée à ce qu’elle porte — c’est-à-dire rien", () => {
    const product = withDefaultDeclared(aProduct());
    const variantId = addVariant(product);

    product.alignVariant(variantId, "regulatory", false);

    expect(product.snapshot().variants[1]?.allergens).toBeNull();
  });
});

describe("les refus de l’alignement", () => {
  it("refuse que la déclinaison par défaut se suive elle-même", () => {
    const product = aProduct();

    expect(() => product.alignVariant("var_1", "regulatory", true)).toThrow(
      DefaultVariantCannotFollowItselfError,
    );
  });

  it("refuse d’aligner une déclinaison qui n’est pas de cette fiche", () => {
    const product = aProduct();

    expect(() => product.alignVariant("var_ailleurs", "regulatory", true)).toThrow(
      VariantNotInProductError,
    );
  });
});

/**
 * 🔴 **Les deux moitiés s'alignent séparément** — lot 4 du plan
 * `plan-separer-allergenes-et-nutrition.md` (D1).
 *
 * Un drapeau unique faisait payer un désalignement sur l'autre moitié : se
 * détacher pour saisir ses propres valeurs nutritionnelles rendait du même
 * geste la déclinaison muette sur ses allergènes — donc impubliable, et pire,
 * projetée aux canaux avec `allergens: null` que personne ne doit lire
 * « sans allergène ».
 */
describe("les allergènes et la nutrition s’alignent séparément", () => {
  /** Déclare les DEUX moitiés du défaut, avec une trace et une valeur. */
  function withDefaultSheet(product: Product): Product {
    const snapshot = product.snapshot();
    const [first, ...rest] = snapshot.variants;
    return Product.reconstitute({
      ...snapshot,
      variants: [
        {
          ...first!,
          allergens: ["AM"],
          nutrition: { ...BLANK, mayContain: ["GB"], saltG: 2 },
        },
        ...rest,
      ],
    });
  }

  it("une déclinaison ajoutée naît alignée sur les deux", () => {
    const product = withDefaultSheet(aProduct());

    addVariant(product);

    expect(product.snapshot().variants[1]).toMatchObject({
      regulatoryFollowsDefault: true,
      nutritionFollowsDefault: true,
    });
  });

  it("se détacher des valeurs ne détache pas les allergènes", () => {
    const product = withDefaultSheet(aProduct());
    const variantId = addVariant(product);

    product.alignVariant(variantId, "nutrition", false);

    const after = product.snapshot().variants[1];
    // Les allergènes du défaut sont toujours ceux de l'étiquette…
    expect(after?.allergens).toEqual(["AM"]);
    // …et les valeurs sont redevenues les siennes, c'est-à-dire aucune.
    expect(after?.nutrition?.saltG).toBeNull();
  });

  /**
   * 🔴 Les traces suivent les ALLERGÈNES, jamais les valeurs (plan §5) : une
   * trace est une déclaration de sécurité, soumise au même référentiel. Les
   * faire suivre le drapeau nutritionnel mettrait la trace d'un autre article
   * sur une étiquette.
   */
  it("garde les traces du défaut quand seules les valeurs se détachent", () => {
    const product = withDefaultSheet(aProduct());
    const variantId = addVariant(product);

    product.alignVariant(variantId, "nutrition", false);

    expect(product.snapshot().variants[1]?.nutrition?.mayContain).toEqual(["GB"]);
  });

  it("rend les traces à la déclinaison quand ce sont les allergènes qui se détachent", () => {
    const product = withDefaultSheet(aProduct());
    const variantId = addVariant(product);

    product.alignVariant(variantId, "allergens", false);

    const after = product.snapshot().variants[1];
    expect(after?.allergens).toBeNull();
    expect(after?.nutrition?.mayContain).toEqual([]);
    // Les VALEURS, elles, restent celles du défaut : l'autre drapeau n'a pas bougé.
    expect(after?.nutrition?.saltG).toBe(2);
  });

  /** L'ancienne valeur reste acceptée et vise le drapeau des allergènes (§6d). */
  it("« regulatory » vise exactement le même drapeau que « allergens »", () => {
    const product = withDefaultSheet(aProduct());
    const variantId = addVariant(product);

    product.alignVariant(variantId, "regulatory", false);

    expect(product.snapshot().variants[1]).toMatchObject({
      regulatoryFollowsDefault: false,
      nutritionFollowsDefault: true,
    });
  });

  it("refuse que le défaut suive ses propres valeurs", () => {
    const product = aProduct();

    expect(() => product.alignVariant("var_1", "nutrition", true)).toThrow(
      DefaultVariantCannotFollowItselfError,
    );
  });

  /**
   * L'invariant 7 lit les ALLERGÈNES : suivre les valeurs du défaut ne couvre
   * personne, et ne doit surtout pas laisser publier une fiche muette.
   */
  it("suivre les valeurs seules ne rend pas la déclinaison étiquetable", () => {
    const product = withDefaultSheet(aProduct());
    const variantId = addVariant(product);

    product.alignVariant(variantId, "allergens", false);

    expect(() => product.publish()).toThrow(ProductNotPublishableError);
  });

  /**
   * 🔴 **Le symétrique, et c'est le cas qui motive le lot 5** : se détacher des
   * VALEURS ne retire rien à l'étiquetage.
   *
   * C'est le cas courant d'un format différent de la même pâte — mêmes
   * allergènes, portion différente, donc valeurs propres. Juger la couverture
   * sur le mauvais drapeau l'aurait rendu impubliable sur un geste qui ne
   * touche pas à la sécurité du mangeur.
   */
  it("se détacher des valeurs laisse la déclinaison publiable", () => {
    const product = withDefaultSheet(aProduct());
    const variantId = addVariant(product);

    product.alignVariant(variantId, "nutrition", false);

    expect(() => product.publish()).not.toThrow();
    expect(product.status).toBe("published");
  });

  /**
   * Et elle reste publiable **après** avoir saisi ses propres valeurs : rien
   * dans ce geste ne peut toucher la déclaration qu'elle hérite du défaut.
   */
  it("saisir ses propres valeurs ne la rend pas impubliable", () => {
    const product = withDefaultSheet(aProduct());
    const variantId = addVariant(product);
    product.alignVariant(variantId, "nutrition", false);

    product.declareNutritionValues(variantId, { ...BLANK, energyKcal: 410 });

    expect(() => product.publish()).not.toThrow();
    // Les allergènes viennent toujours du défaut, et ce sont eux qui couvrent.
    expect(product.snapshot().variants[1]?.allergens).toEqual(["AM"]);
  });
});
