import type {
  AudiencePickupDiscount,
  CartAdjustment,
  CustomerAudience,
  PickupDiscountCategoryRule,
  PickupDiscountProductRule,
  PickupDiscounts,
  PickupDiscountScope,
  PublishedCatalogView,
} from '@lfd/contracts';
import { pickupDiscountHasRules } from '@lfd/contracts';
import { formatAdjustmentValue } from '@lfd/b2b-ui/pricing';

/**
 * **La remise d'un point pour une clientèle, telle que l'écran l'édite** —
 * lot B du plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`.
 *
 * Le contrat (`AudiencePickupDiscount`) ne connaît pas « pas de réduction » :
 * une clientèle sans remise y vaut `null`, règles comprises. L'écran, lui,
 * doit pouvoir retirer la réduction puis la remettre sans perdre le mode qu'on
 * vient de choisir : d'où le brouillon, dont la réduction est nullable.
 */
export interface DiscountDraft {
  readonly adjustment: CartAdjustment | null;
  readonly scope: PickupDiscountScope;
  readonly categories: readonly PickupDiscountCategoryRule[];
  readonly products: readonly PickupDiscountProductRule[];
}

/** Ce que la carte nomme de chaque clientèle. */
export const AUDIENCE_TITLE: Readonly<Record<CustomerAudience, string>> = {
  b2b: 'Pros',
  b2c: 'Particuliers',
};

export function draftOf(discount: AudiencePickupDiscount | null): DiscountDraft {
  return discount ?? { adjustment: null, scope: 'all_except', categories: [], products: [] };
}

/** Le brouillon → le contrat. Sans réduction, la clientèle n'a pas de remise, ni de règle. */
export function discountOf(draft: DiscountDraft): AudiencePickupDiscount | null {
  if (draft.adjustment === null) {
    return null;
  }
  return {
    adjustment: draft.adjustment,
    scope: draft.scope,
    categories: draft.categories,
    products: draft.products,
  };
}

/**
 * Le sens d'une règle « dans le mode » : `all_except` liste ce qu'on retire,
 * `only` ce qu'on garde. Une règle dans l'autre sens est une CONTRADICTION —
 * admise sur un produit seulement (Q1 du plan).
 */
export function modeSense(scope: PickupDiscountScope): boolean {
  return scope === 'only';
}

/** Une famille ou un produit qu'on peut choisir. */
export interface CatalogueChoice {
  readonly id: string;
  readonly label: string;
}

/** Les produits d'une famille, pour un choix groupé. */
export interface ProductGroup {
  readonly label: string;
  readonly products: readonly CatalogueChoice[];
}

/**
 * **Ce que les règles peuvent viser** : les familles et les produits du
 * catalogue publié. Une famille retirée au référentiel, ou une fiche archivée,
 * n'est plus proposée — une règle qui la vise encore est orpheline (V9).
 */
export interface DiscountCatalogue {
  readonly families: readonly CatalogueChoice[];
  readonly productGroups: readonly ProductGroup[];
  /** Tous les noms connus, retirés compris : une orpheline se nomme quand on le peut. */
  readonly names: ReadonlyMap<string, string>;
}

export function discountCatalogueOf(view: PublishedCatalogView): DiscountCatalogue {
  const names = new Map<string, string>();
  for (const shelf of view.shelves) {
    names.set(shelf.categoryId, shelf.name ?? shelf.categoryId);
  }
  for (const entry of view.entries) {
    names.set(entry.productId, entry.name);
  }
  const families = view.shelves
    .filter((shelf) => !shelf.withdrawn)
    .map((shelf) => ({ id: shelf.categoryId, label: shelf.name ?? shelf.categoryId }));
  const productGroups = families
    .map((family) => ({
      label: family.label,
      products: view.entries
        .filter((entry) => entry.categoryId === family.id && entry.status !== 'archived')
        .map((entry) => ({ id: entry.productId, label: entry.name })),
    }))
    .filter((group) => group.products.length > 0);
  return { families, productGroups, names };
}

/** Une règle qui ne pointe plus sur rien du catalogue, ou que l'écran ne sait pas éditer. */
export interface StrayRule {
  readonly kind: 'category' | 'product';
  readonly id: string;
  readonly message: string;
}

/**
 * **Les règles que les listes ne montrent pas** — à dire en alerte, et à
 * retirer d'un geste (V9) :
 * - une famille retirée, ou un produit archivé ou disparu du catalogue ;
 * - une règle de famille à contre-sens du mode : l'écran n'en pose pas (Q1),
 *   mais le serveur l'accepte, et une règle invisible ne se corrige pas.
 */
export function strayRules(draft: DiscountDraft, catalogue: DiscountCatalogue): StrayRule[] {
  const families = new Set(catalogue.families.map((family) => family.id));
  const products = new Set(
    catalogue.productGroups.flatMap((group) => group.products.map((product) => product.id)),
  );
  const nameOf = (id: string): string => catalogue.names.get(id) ?? id;
  const stray: StrayRule[] = [];
  for (const rule of draft.categories) {
    if (!families.has(rule.categoryId)) {
      stray.push({
        kind: 'category',
        id: rule.categoryId,
        message: `La famille « ${nameOf(rule.categoryId)} » n'est plus au catalogue : cette règle ne vise plus rien.`,
      });
    } else if (rule.eligible !== modeSense(draft.scope)) {
      stray.push({
        kind: 'category',
        id: rule.categoryId,
        message: `La famille « ${nameOf(rule.categoryId)} » est ${rule.eligible ? 'incluse' : 'exclue'}, à contre-sens du mode choisi.`,
      });
    }
  }
  for (const rule of draft.products) {
    if (!products.has(rule.productId)) {
      stray.push({
        kind: 'product',
        id: rule.productId,
        message: `Le produit « ${nameOf(rule.productId)} » n'est plus au catalogue : cette règle ne vise plus rien.`,
      });
    }
  }
  return stray;
}

/** Les familles réglées dans le sens du mode, et présentes au catalogue. */
export function chosenFamilies(draft: DiscountDraft, catalogue: DiscountCatalogue): string[] {
  const known = new Set(catalogue.families.map((family) => family.id));
  return draft.categories
    .filter((rule) => rule.eligible === modeSense(draft.scope) && known.has(rule.categoryId))
    .map((rule) => rule.categoryId);
}

/**
 * Les produits réglés dans un sens donné, et présents au catalogue.
 * `contradicting` = à contre-sens du mode : ils l'emportent sur leur famille.
 */
export function chosenProducts(
  draft: DiscountDraft,
  catalogue: DiscountCatalogue,
  contradicting: boolean,
): string[] {
  const known = new Set(
    catalogue.productGroups.flatMap((group) => group.products.map((product) => product.id)),
  );
  const sense = contradicting ? !modeSense(draft.scope) : modeSense(draft.scope);
  return draft.products
    .filter((rule) => rule.eligible === sense && known.has(rule.productId))
    .map((rule) => rule.productId);
}

/** Remplace les familles du mode ; les autres règles de famille restent (orphelines, contre-sens). */
export function withFamilies(
  draft: DiscountDraft,
  ids: readonly string[],
  catalogue: DiscountCatalogue,
): DiscountDraft {
  const sense = modeSense(draft.scope);
  const chosen = new Set(ids);
  const known = new Set(catalogue.families.map((family) => family.id));
  // On garde l'autre sens et les orphelines : l'alerte les montre, elle seule les retire.
  const kept = draft.categories.filter(
    (rule) =>
      !chosen.has(rule.categoryId) && (rule.eligible !== sense || !known.has(rule.categoryId)),
  );
  return {
    ...draft,
    categories: [...kept, ...ids.map((categoryId) => ({ categoryId, eligible: sense }))],
  };
}

/**
 * Remplace les produits d'un sens, sans toucher à ceux de l'autre. Un
 * produit ne se règle qu'une fois (le serveur refuse le double) : le choisir
 * ici le retire de l'autre liste.
 */
export function withProducts(
  draft: DiscountDraft,
  ids: readonly string[],
  contradicting: boolean,
  catalogue: DiscountCatalogue,
): DiscountDraft {
  const sense = contradicting ? !modeSense(draft.scope) : modeSense(draft.scope);
  const chosen = new Set(ids);
  const known = new Set(
    catalogue.productGroups.flatMap((group) => group.products.map((product) => product.id)),
  );
  // On garde : l'autre sens (sauf ce qu'on vient d'y prendre) et les orphelines.
  const kept = draft.products.filter(
    (rule) =>
      !chosen.has(rule.productId) && (rule.eligible !== sense || !known.has(rule.productId)),
  );
  return {
    ...draft,
    products: [...kept, ...ids.map((productId) => ({ productId, eligible: sense }))],
  };
}

/**
 * Changer de mode vide les règles : une famille exclue de « tout, sauf… »
 * n'est pas une famille incluse de « seulement… ». Rien n'est enregistré
 * avant le bouton, et revenir au mode d'avant se fait en annulant.
 */
export function withScope(draft: DiscountDraft, scope: PickupDiscountScope): DiscountDraft {
  return scope === draft.scope ? draft : { ...draft, scope, categories: [], products: [] };
}

/** Retire une règle désignée par l'alerte. */
export function withoutRule(draft: DiscountDraft, stray: StrayRule): DiscountDraft {
  return stray.kind === 'category'
    ? { ...draft, categories: draft.categories.filter((rule) => rule.categoryId !== stray.id) }
    : { ...draft, products: draft.products.filter((rule) => rule.productId !== stray.id) };
}

/**
 * Les pastilles d'un point dans la liste des sites : « Pros − 10 % »,
 * « Particuliers − 2,00 € sur une sélection ». Une par clientèle remisée.
 */
export function discountBadges(discounts: PickupDiscounts): string[] {
  return (['b2b', 'b2c'] as const)
    .map((audience) => {
      const discount = discounts[audience];
      if (discount === null) {
        return '';
      }
      const partial = pickupDiscountHasRules(discount) ? ' sur une sélection' : '';
      return `${AUDIENCE_TITLE[audience]} − ${formatAdjustmentValue(discount.adjustment)}${partial}`;
    })
    .filter((label) => label !== '');
}
