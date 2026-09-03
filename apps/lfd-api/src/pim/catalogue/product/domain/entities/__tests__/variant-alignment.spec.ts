import {
  DefaultVariantCannotFollowItselfError,
  ProductNotPublishableError,
  VariantNotInProductError,
} from "../../errors/product-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";

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
