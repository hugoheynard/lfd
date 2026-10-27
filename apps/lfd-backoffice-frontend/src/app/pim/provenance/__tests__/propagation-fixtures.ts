import type {
  IngredientAllergenPropagationView,
  VariantAllergenPropagationView,
} from '@lfd/pim-contracts';

/** Une déclinaison sans rien à faire — chaque cas n'écrit que ce qui le distingue. */
export function variant(
  variantId: string,
  patch: Partial<VariantAllergenPropagationView> = {},
): VariantAllergenPropagationView {
  return {
    variantId,
    sku: `SKU-${variantId}`,
    toAdd: [],
    toRemove: [],
    promotedFromTrace: [],
    becomesNone: false,
    blocked: [],
    undeclared: false,
    ...patch,
  };
}

/** Le lait retiré du beurre : deux fiches perdraient, l'une publiée. */
export const MILK_REMOVED: IngredientAllergenPropagationView = {
  ingredientKey: 'beurre-doux',
  ingredientName: 'Beurre doux',
  added: [],
  removed: ['AM'],
  products: [
    {
      productId: 'prd_croissant',
      name: 'Croissant',
      status: 'published',
      variants: [variant('v1', { toRemove: ['AM'], becomesNone: true })],
    },
    {
      productId: 'prd_brioche',
      name: 'Brioche',
      status: 'draft',
      variants: [variant('v2', { toRemove: ['AM'] })],
    },
    { productId: 'prd_flan', name: 'Flan', status: 'draft', variants: [variant('v3')] },
  ],
  counts: {
    productsTouched: 3,
    toLose: 2,
    toLosePublished: 1,
    toReceive: 0,
    toReceivePublished: 0,
    blocked: 0,
    undeclared: 0,
    alreadyDeclared: 0,
    keptByOtherIngredient: 1,
  },
};
