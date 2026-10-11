import type { ActivityEventView } from '@lfd/contracts';

/** Un texte changé par une publication : ce que la boutique disait avant, et après. */
export interface PublishedChange {
  readonly key: string;
  readonly locale: string;
  /** `null` : le texte du code. */
  readonly before: string | null;
  readonly after: string | null;
}

/** Une publication, lue dans le journal. */
export interface Publication {
  readonly id: string;
  readonly version: number | null;
  readonly occurredAt: string;
  readonly author: string;
  readonly changes: readonly PublishedChange[];
}

/**
 * Relit un fait `shop_copy.published` (cf. `ShopCopyPublishedEvent`, API).
 * Le journal rend sa charge sans type : chaque champ est vérifié, et un
 * changement mal formé est écarté plutôt que deviné.
 */
export function publicationOf(event: ActivityEventView): Publication {
  const payload = event.payload;
  const version = typeof payload['version'] === 'number' ? payload['version'] : null;
  const changes: unknown = payload['changes'];
  const raw: readonly unknown[] = Array.isArray(changes) ? changes : [];
  return {
    id: event.id,
    version,
    occurredAt: event.occurredAt,
    author: event.actorName ?? 'Un membre du staff',
    changes: raw.flatMap((item) => {
      const change = changeOf(item);
      return change === null ? [] : [change];
    }),
  };
}

function changeOf(item: unknown): PublishedChange | null {
  if (
    typeof item !== 'object' ||
    item === null ||
    !('key' in item) ||
    !('locale' in item) ||
    typeof item.key !== 'string' ||
    typeof item.locale !== 'string'
  ) {
    return null;
  }
  return {
    key: item.key,
    locale: item.locale,
    before: 'before' in item ? textOrNull(item.before) : null,
    after: 'after' in item ? textOrNull(item.after) : null,
  };
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
