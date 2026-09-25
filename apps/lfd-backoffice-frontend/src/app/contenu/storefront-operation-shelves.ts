import type { StorefrontContent } from '@lfd/contracts';

import type { ShelfKey } from '@lfd/storefront-layout';

const OPERATION_SHELF_PREFIX = 'op:';

/**
 * Les rayons d'opération qu'annoncent ces contenus — liés à l'opération, ou
 * ouvrant son rayon.
 *
 * La boutique ne sert JAMAIS une annonce dans le rayon qu'elle annonce
 * (`operation-announcements.ts` côté serveur, Hugo le 2026-09-25) : l'objet
 * paraît « partout sauf là ». L'éditeur s'en sert pour le dire, pas pour le
 * décider.
 */
export function announcedShelvesOf(items: readonly StorefrontContent[]): readonly ShelfKey[] {
  const keys = new Set<ShelfKey>();
  for (const item of items) {
    if (item.kind !== 'info') {
      continue;
    }
    if (item.operationKey !== undefined && item.operationKey !== null) {
      keys.add(`${OPERATION_SHELF_PREFIX}${item.operationKey}`);
    }
    if (item.linkShelfKey?.startsWith(OPERATION_SHELF_PREFIX) === true) {
      keys.add(item.linkShelfKey);
    }
  }
  return [...keys];
}
