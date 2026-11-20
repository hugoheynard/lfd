import type {
  ShopItemView,
  ShopShelfView,
  SubAccountMenuBody,
  SubAccountMenuEffect,
  SubAccountMenuEntry,
  SubAccountMenuLevel,
  SubAccountMenuMode,
  SubAccountOffMenuDisplay,
  SubAccountMenuPayload,
} from '@lfd/contracts';

/**
 * **La carte d'un site, telle que l'écran la compose** avant de l'envoyer
 * entière (`PUT`, `carte-des-sites.md` § 3.3, § 4).
 */
export interface MenuDraft {
  readonly mode: SubAccountMenuMode;
  readonly offMenu: SubAccountOffMenuDisplay;
  readonly entries: readonly SubAccountMenuEntry[];
}

/** Ce qu'un nœud de l'arbre dit de lui-même : rien (il hérite), ou une entrée. */
export type NodeEffect = SubAccountMenuEffect | 'inherit';

/**
 * Le grain auquel l'écran règle un article : le **produit**, désigné par le SKU
 * que le rayon sert. Pour la déclinaison par défaut, c'est le SKU du produit
 * (`ShopItemView.sku`) ; la vue du rayon ne porte pas `productSku`, et ne dit
 * pas quand une vignette montre une autre déclinaison.
 */
export const ITEM_LEVEL: SubAccountMenuLevel = 'product';

/**
 * Le point de départ quand aucune carte n'est posée : « tout, sans exception »
 * — la carte qui ne restreint rien —, et un hors-carte visible, verrouillé.
 */
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

/** La lignée d'un rayon : lui, puis ses parentes (`parentId`), la plus proche d'abord. */
export function familyPathOf(
  shelfId: string,
  shelves: readonly ShopShelfView[],
): readonly string[] {
  const byId = new Map(shelves.map((shelf) => [shelf.id, shelf]));
  const path: string[] = [];
  let current: string | null | undefined = shelfId;
  while (current !== null && current !== undefined && !path.includes(current)) {
    path.push(current);
    current = byId.get(current)?.parentId;
  }
  return path;
}

/**
 * L'article est-il dans la carte ? Le jugement du serveur
 * (`catalog/domain/sub-account-menu-verdict.ts`), rejoué pour le résumé et
 * l'état de chaque ligne : le plus fin l'emporte — SKU, produit, la famille la
 * plus proche, ses parentes —, et sans entrée, le mode donne le défaut.
 */
export function isOpenUnder(
  draft: MenuDraft,
  item: Pick<ShopItemView, 'sku' | 'shelfId'>,
  shelves: readonly ShopShelfView[],
): boolean {
  const candidates: readonly (readonly [SubAccountMenuLevel, string])[] = [
    ['sku', item.sku],
    ['product', item.sku],
    ...familyPathOf(item.shelfId, shelves).map((id) => ['family', id] as const),
  ];
  for (const [level, ref] of candidates) {
    const effect = effectAt(draft, level, ref);
    if (effect !== 'inherit') {
      return effect === 'include';
    }
  }
  return draft.mode === 'except';
}

/**
 * Les entrées qui ne désignent rien de ce que le catalogue montre : une
 * famille, un produit ou une déclinaison qu'il ne livre plus. Elles dorment
 * (§ 3.3) ; l'écran les montre pour qu'on puisse les retirer.
 */
export function staleEntries(
  draft: MenuDraft,
  items: readonly Pick<ShopItemView, 'sku'>[],
  shelves: readonly Pick<ShopShelfView, 'id'>[],
): readonly SubAccountMenuEntry[] {
  const families = new Set(shelves.map((shelf) => shelf.id));
  const skus = new Set(items.map((item) => item.sku));
  return draft.entries.filter((entry) =>
    entry.level === 'family' ? !families.has(entry.ref) : !skus.has(entry.ref),
  );
}
