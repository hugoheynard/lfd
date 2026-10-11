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

/** Ce qui restreint l'arbre : la recherche, et les clés que l'aperçu montre. */
export interface SpaceFilter {
  readonly matches: (entry: ShopCopyEntryView) => boolean;
  /** `null` : pas de restriction à l'aperçu. */
  readonly visibleKeys: ReadonlySet<string> | null;
}

/** Une clé passe-t-elle le filtre ? */
export function passes(entry: ShopCopyEntryView, filter: SpaceFilter): boolean {
  if (filter.visibleKeys !== null && !filter.visibleKeys.has(entry.key)) {
    return false;
  }
  return filter.matches(entry);
}

/**
 * L'arbre des espaces, dans l'ordre du recueil. Un espace sans aucune clé
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
  return [...known, ...unknown].map((space) => node(space, bySpace.get(space.space) ?? []));
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
