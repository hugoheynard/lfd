import type {
  ShopifyProductPayload,
  ShopifyVariantPayload,
} from './projection.js';

/**
 * Entrée de la mutation `productSet` (upsert par handle). **Pure et testable** : la
 * traduction du payload canonique vers la forme exacte qu'attend l'API Admin est la
 * partie qui peut mentir — on l'isole du transport pour la couvrir sans réseau.
 */
export interface ProductSetInput {
  readonly title: string;
  readonly handle: string;
  readonly status: 'ACTIVE' | 'DRAFT';
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

/** Traduit un produit projeté en entrée `productSet`. */
export function buildProductSetInput(
  payload: ShopifyProductPayload,
): ProductSetInput {
  const optionNames = optionNamesOf(payload.variants);
  const base = {
    title: payload.title,
    handle: payload.handle,
    status: payload.status,
  } as const;

  // Aucune option → variante par défaut : on n'envoie ni productOptions ni optionValues.
  if (optionNames.length === 0) {
    return { ...base, variants: payload.variants.map(variantBase) };
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
        name: variant.options[name] ?? '',
      })),
    })),
  };
}

/** Le socle commun d'une variante : le SKU, et le prix seulement s'il est tarifé. */
function variantBase(variant: ShopifyVariantPayload): ProductSetVariant {
  return variant.price === null
    ? { sku: variant.sku }
    : { sku: variant.sku, price: variant.price };
}

/** Noms d'options rencontrés, dans l'ordre de première apparition (déterministe). */
function optionNamesOf(
  variants: readonly ShopifyVariantPayload[],
): readonly string[] {
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
