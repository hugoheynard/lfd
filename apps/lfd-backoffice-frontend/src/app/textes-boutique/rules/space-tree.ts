import type { ShopCopyEntryView } from '@lfd/contracts';

import { isModified, isPending, isStale } from './copy-text';
import { SHOP_COPY_SPACES } from './shop-copy-spaces';

/** Un espace de l'arbre, avec ce que ses pastilles disent. */
export interface SpaceNode {
  readonly space: string;
  readonly title: string;
  readonly journey: boolean;
  readonly count: number;
  readonly modified: number;
  readonly pending: number;
  readonly stale: number;
}

/** Ce qui restreint l'arbre : la recherche, les espaces admis, et les clés que l'aperçu montre. */
export interface SpaceFilter {
  readonly matches: (entry: ShopCopyEntryView) => boolean;
  /** Les espaces admis (ceux d'une clientèle) ; `null` : tous. */
  readonly spaces?: ((space: string) => boolean) | null;
  /**
   * Les clés que l'aperçu montre, DANS L'ORDRE où il les montre ; `null` : pas
   * de restriction à l'aperçu. L'arbre range alors ses espaces dans cet ordre.
   */
  readonly visibleKeys: readonly string[] | null;
}

/** Une clé passe-t-elle le filtre ? */
export function passes(entry: ShopCopyEntryView, filter: SpaceFilter): boolean {
  if (filter.visibleKeys !== null && !filter.visibleKeys.includes(entry.key)) {
    return false;
  }
  if (entry.space !== null && filter.spaces != null && !filter.spaces(entry.space)) {
    return false;
  }
  return filter.matches(entry);
}

/**
 * L'arbre des espaces, dans l'ordre du recueil — ou, filtré par l'aperçu,
 * dans l'ordre où l'écran montre leur première clé. Un espace sans aucune clé
 * retenue par le filtre disparaît ; un espace que la liste recopiée ne connaît
 * pas s'affiche sous son identifiant, à la fin — jamais perdu.
 */
export function spaceTree(
  entries: readonly ShopCopyEntryView[],
  filter: SpaceFilter,
): readonly SpaceNode[] {
  const bySpace = new Map<string, ShopCopyEntryView[]>();
  for (const entry of entries) {
    if (entry.space === null || !passes(entry, filter)) {
      continue;
    }
    const list = bySpace.get(entry.space) ?? [];
    list.push(entry);
    bySpace.set(entry.space, list);
  }
  const known = SHOP_COPY_SPACES.filter((space) => bySpace.has(space.space));
  const knownIds = new Set(known.map((space) => space.space));
  const unknown = [...bySpace.keys()]
    .filter((space) => !knownIds.has(space))
    .map((space) => ({ space, title: space, journey: false }));
  const nodes = [...known, ...unknown].map((space) => node(space, bySpace.get(space.space) ?? []));
  const order = filter.visibleKeys;
  if (order === null) {
    return nodes;
  }
  const rank = (space: string): number =>
    order.findIndex((key) => bySpace.get(space)?.some((entry) => entry.key === key) === true);
  return [...nodes].sort((a, b) => rank(a.space) - rank(b.space));
}

function node(
  space: { readonly space: string; readonly title: string; readonly journey: boolean },
  entries: readonly ShopCopyEntryView[],
): SpaceNode {
  return {
    ...space,
    count: entries.length,
    modified: entries.filter(isModified).length,
    pending: entries.filter(isPending).length,
    stale: entries.filter(isStale).length,
  };
}
