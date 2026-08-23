import type { ShopifyProductPayload, ShopifyVariantPayload } from "./projection.js";

/**
 * Entrée de la mutation `productSet` (upsert par handle). **Pure et testable** : la
 * traduction du payload canonique vers la forme exacte qu'attend l'API Admin est la
 * partie qui peut mentir — on l'isole du transport pour la couvrir sans réseau.
 */
export interface ProductSetInput {
  readonly title: string;
  readonly handle: string;
  readonly status: "ACTIVE" | "DRAFT";
  /** Toujours envoyé, `""` compris : le référentiel fait autorité sur la description. */
  readonly descriptionHtml: string;
  readonly seo: { readonly title: string; readonly description: string };
  /** Omis quand le référentiel ne déclare pas de marque — cf. `ShopifyProductPayload`. */
  readonly vendor?: string;
  /** Déclaré seulement s'il y a de vraies options ; sinon Shopify crée la variante par défaut. */
  readonly productOptions?: readonly ProductSetOption[];
  readonly variants: readonly ProductSetVariant[];
}

interface ProductSetOption {
  readonly name: string;
  readonly position: number;
  readonly values: readonly { readonly name: string }[];
}

interface ProductSetVariant {
  readonly sku: string;
  /** Décimal texte ; omis quand le produit n'est pas encore tarifé. */
  readonly price?: string;
  readonly optionValues?: readonly {
    readonly optionName: string;
    readonly name: string;
  }[];
}

/**
 * Option implicite de Shopify pour un produit **sans variante déclarée** : chaque
 * variante *doit* porter au moins une `optionValue`, et `productOptions` *doit* être
 * déclaré dès qu'on en fournit une (vérifié sur la boutique, cf.
 * `shopify-productset-findings.md` F2/F4). On matérialise donc l'option par défaut.
 */
const DEFAULT_OPTION = "Title";
const DEFAULT_OPTION_VALUE = "Default Title";

/** Traduit un produit projeté en entrée `productSet`. */
export function buildProductSetInput(payload: ShopifyProductPayload): ProductSetInput {
  const optionNames = optionNamesOf(payload.variants);
  const base = {
    title: payload.title,
    handle: payload.handle,
    status: payload.status,
    descriptionHtml: payload.descriptionHtml,
    seo: payload.seo,
    ...(payload.vendor === null ? {} : { vendor: payload.vendor }),
  } as const;

  // Aucune vraie option → l'option par défaut `Title` / `Default Title`, obligatoire.
  if (optionNames.length === 0) {
    return {
      ...base,
      productOptions: [
        {
          name: DEFAULT_OPTION,
          position: 1,
          values: [{ name: DEFAULT_OPTION_VALUE }],
        },
      ],
      variants: payload.variants.map((variant) => ({
        ...variantBase(variant),
        optionValues: [{ optionName: DEFAULT_OPTION, name: DEFAULT_OPTION_VALUE }],
      })),
    };
  }

  return {
    ...base,
    productOptions: optionNames.map((name, index) => ({
      name,
      position: index + 1,
      values: distinctValues(payload.variants, name).map((value) => ({
        name: value,
      })),
    })),
    variants: payload.variants.map((variant) => ({
      ...variantBase(variant),
      optionValues: optionNames.map((name) => ({
        optionName: name,
        name: variant.options[name] ?? "",
      })),
    })),
  };
}

/** Le socle commun d'une variante : le SKU, et le prix seulement s'il est tarifé. */
function variantBase(variant: ShopifyVariantPayload): ProductSetVariant {
  return variant.price === null ? { sku: variant.sku } : { sku: variant.sku, price: variant.price };
}

/** Noms d'options rencontrés, dans l'ordre de première apparition (déterministe). */
function optionNamesOf(variants: readonly ShopifyVariantPayload[]): readonly string[] {
  const names: string[] = [];
  for (const variant of variants) {
    for (const key of Object.keys(variant.options)) {
      if (!names.includes(key)) {
        names.push(key);
      }
    }
  }
  return names;
}

/** Valeurs distinctes d'une option, dans l'ordre de première apparition. */
function distinctValues(
  variants: readonly ShopifyVariantPayload[],
  name: string,
): readonly string[] {
  const values: string[] = [];
  for (const variant of variants) {
    const value = variant.options[name];
    if (value !== undefined && !values.includes(value)) {
      values.push(value);
    }
  }
  return values;
}
