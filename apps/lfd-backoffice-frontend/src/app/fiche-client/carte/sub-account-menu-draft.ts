import type {
  PublishedCatalogView,
  PublishedEntryView,
  PublishedVariantView,
  SubAccountMenuBody,
  SubAccountMenuEffect,
  SubAccountMenuEntry,
  SubAccountMenuLevel,
  SubAccountMenuMode,
  SubAccountMenuPayload,
  SubAccountMenuSummary,
  SubAccountOffMenuDisplay,
} from '@lfd/contracts';

/**
 * **La carte d'un sous-compte, telle que la fiche client la compose** avant de
 * l'envoyer entière (`PUT`, `plan-carte-des-sites.md` § 3.3).
 *
 * La boutique a son propre brouillon (`client/site-menu/site-menu-draft.ts`),
 * bâti sur la vue du rayon, qui ne porte ni `productSku` ni les déclinaisons.
 * Celui-ci lit le catalogue publié du back-office, qui les porte : le staff
 * règle les trois grains, famille, produit et SKU.
 */
export interface MenuDraft {
  readonly mode: SubAccountMenuMode;
  readonly offMenu: SubAccountOffMenuDisplay;
  readonly entries: readonly SubAccountMenuEntry[];
}

/** Ce qu'un nœud dit de lui-même : rien (il hérite), ou une entrée. */
export type NodeEffect = SubAccountMenuEffect | 'inherit';

/** Sans carte posée : « tout, sans exception », et un hors-carte visible, verrouillé. */
export const OPEN_DRAFT: MenuDraft = { mode: 'except', offMenu: 'visible_locked', entries: [] };

/** La carte servie, ou le point de départ. */
export function draftOf(menu: SubAccountMenuBody | null): MenuDraft {
  return menu === null
    ? OPEN_DRAFT
    : { mode: menu.mode, offMenu: menu.offMenu, entries: [...menu.entries] };
}

/** Ce que le `PUT` envoie. */
export function payloadOf(draft: MenuDraft): SubAccountMenuPayload {
  return { mode: draft.mode, offMenu: draft.offMenu, entries: [...draft.entries] };
}

/** L'effet posé sur un nœud, ou `inherit`. */
export function effectAt(draft: MenuDraft, level: SubAccountMenuLevel, ref: string): NodeEffect {
  return (
    draft.entries.find((entry) => entry.level === level && entry.ref === ref)?.effect ?? 'inherit'
  );
}

/** La carte avec ce nœud réglé — `inherit` retire son entrée. */
export function withEffect(
  draft: MenuDraft,
  level: SubAccountMenuLevel,
  ref: string,
  effect: NodeEffect,
): MenuDraft {
  const others = draft.entries.filter((entry) => !(entry.level === level && entry.ref === ref));
  return {
    ...draft,
    entries: effect === 'inherit' ? others : [...others, { level, ref, effect }],
  };
}

/** Deux cartes disent-elles la même chose ? L'ordre des entrées ne compte pas. */
export function sameDraft(left: MenuDraft, right: MenuDraft): boolean {
  if (left.mode !== right.mode || left.offMenu !== right.offMenu) {
    return false;
  }
  const keys = (draft: MenuDraft): string =>
    draft.entries
      .map((entry) => `${entry.level}\u0000${entry.ref}\u0000${entry.effect}`)
      .sort()
      .join('\u0001');
  return keys(left) === keys(right);
}

/** Une déclinaison vue de la carte : son SKU, son produit et la lignée de sa famille. */
export interface MenuArticle {
  readonly sku: string;
  readonly productSku: string;
  /** La famille puis ses parentes, la plus proche en tête (`categoryPath`). */
  readonly familyPath: readonly string[];
}

/**
 * L'article est-il dans la carte ? Le jugement du serveur
 * (`catalog/domain/sub-account-menu-verdict.ts`), rejoué pour le résumé et
 * l'état de chaque ligne : SKU, produit, la famille la plus proche, ses
 * parentes — le plus fin l'emporte ; sans entrée, le mode donne le défaut.
 */
export function isOpenUnder(draft: MenuDraft, article: MenuArticle): boolean {
  const candidates: readonly (readonly [SubAccountMenuLevel, string])[] = [
    ['sku', article.sku],
    ['product', article.productSku],
    ...article.familyPath.map((id) => ['family', id] as const),
  ];
  for (const [level, ref] of candidates) {
    const effect = effectAt(draft, level, ref);
    if (effect !== 'inherit') {
      return effect === 'include';
    }
  }
  return draft.mode === 'except';
}

/** Une déclinaison vendue aux pros — ce qu'un sous-compte peut commander. */
export function soldToPros(variant: PublishedVariantView): boolean {
  return variant.pro.state === 'en_vente';
}

/** Les déclinaisons vendues aux pros d'une fiche, en articles jugeables. */
export function articlesOf(entry: PublishedEntryView): readonly MenuArticle[] {
  return entry.variants.filter(soldToPros).map((variant) => ({
    sku: variant.sku,
    productSku: entry.productSku,
    familyPath: entry.categoryPath,
  }));
}

/**
 * Les entrées qui ne désignent rien de ce que le catalogue publié connaît :
 * une famille, un produit ou une déclinaison qu'il ne livre plus. Elles
 * dorment (§ 3.3) ; l'écran les montre pour qu'on puisse les retirer.
 */
export function staleEntries(
  draft: MenuDraft,
  catalogue: PublishedCatalogView,
): readonly SubAccountMenuEntry[] {
  const families = new Set(catalogue.shelves.map((shelf) => shelf.categoryId));
  const products = new Set(catalogue.entries.map((entry) => entry.productSku));
  const skus = new Set(
    catalogue.entries.flatMap((entry) => entry.variants.map((variant) => variant.sku)),
  );
  return draft.entries.filter((entry) => {
    switch (entry.level) {
      case 'family':
        return !families.has(entry.ref);
      case 'product':
        return !products.has(entry.ref);
      case 'sku':
        return !skus.has(entry.ref);
    }
  });
}

/**
 * Le sujet de la clé d'intention d'un enregistrement : le site et la carte
 * envoyée, ordre des entrées ignoré. Le même brouillon renvoyé reprend la clé
 * (le serveur rend la réponse d'origine) ; un autre brouillon en prend une neuve.
 */
export function intentSubjectOf(companyId: string, draft: MenuDraft): string {
  const entries = draft.entries
    .map((entry) => `${entry.level}:${entry.ref}:${entry.effect}`)
    .sort()
    .join(',');
  return `menu:${companyId}:${draft.mode}:${draft.offMenu}:${entries}`;
}

/**
 * Ce que la liste des sites d'un principal dit de la carte d'un site — ou
 * `null` sans carte posée.
 */
export function menuIndicator(menu: SubAccountMenuSummary | null): string | null {
  if (menu === null) {
    return null;
  }
  const kind = menu.mode === 'only' ? 'liste blanche' : 'liste noire';
  const count = menu.entryCount;
  const entries =
    count === 0 ? 'aucune entrée' : count === 1 ? '1 entrée' : `${String(count)} entrées`;
  return `Carte : ${kind}, ${entries}`;
}
