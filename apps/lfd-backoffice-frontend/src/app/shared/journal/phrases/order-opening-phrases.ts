import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import { byActor, text, type Phrase, type PhraseFact, type Segment } from '../phrase';

/**
 * **L'ouverture de la boutique à la commande** (Hugo, 2026-10-09) — le miroir
 * de `order_opening.updated` dans `@lfd/contracts`.
 *
 * Chaque bascule ne touche qu'une clientèle : la phrase dit ce qui a été fermé
 * ou rouvert, puis ce qui n'a pas bougé. La charge porte l'avant et l'après,
 * le détail n'a donc plus rien à ajouter.
 */

const CLIENTELES = [
  { key: 'ordersOpenToB2b', to: 'aux professionnels' },
  { key: 'ordersOpenToB2c', to: 'aux particuliers' },
] as const;

interface Opening {
  readonly to: string;
  readonly before: boolean;
  readonly after: boolean;
}

/** L'avant et l'après de chaque clientèle, ou `null` si la charge ne les porte pas tous. */
function openings(fact: PhraseFact): readonly Opening[] | null {
  const previous = recordOf(fact.payload['previous']);
  const read: Opening[] = [];
  for (const { key, to } of CLIENTELES) {
    const before = previous?.[key];
    const after = fact.payload[key];
    if (typeof before !== 'boolean' || typeof after !== 'boolean') {
      return null;
    }
    read.push({ to, before, after });
  }
  return read;
}

function joined(entries: readonly Opening[]): string {
  return entries.map((entry) => entry.to).join(' et ');
}

/** « a fermé les commandes aux particuliers ; elles restent ouvertes aux professionnels ». */
function orderOpening(fact: PhraseFact): Segment[] {
  const entries = openings(fact);
  if (entries === null) {
    return [text('a réglé l’ouverture de la boutique')];
  }
  const opened = entries.filter((entry) => !entry.before && entry.after);
  const closed = entries.filter((entry) => entry.before && !entry.after);
  const kept = entries.filter((entry) => entry.before === entry.after);
  const changes = [
    ...(opened.length === 0 ? [] : [`a rouvert les commandes ${joined(opened)}`]),
    ...(closed.length === 0 ? [] : [`a fermé les commandes ${joined(closed)}`]),
  ];
  if (changes.length === 0) {
    return [text('a réglé l’ouverture de la boutique sans la changer')];
  }
  const keptOpen = kept.filter((entry) => entry.after);
  const keptClosed = kept.filter((entry) => !entry.after);
  const rest = [
    ...(keptOpen.length === 0 ? [] : [`elles restent ouvertes ${joined(keptOpen)}`]),
    ...(keptClosed.length === 0 ? [] : [`elles restent fermées ${joined(keptClosed)}`]),
  ];
  return [text([changes.join(' et '), ...rest].join(' ; '))];
}

export const ORDER_OPENING_PHRASES = {
  'order_opening.updated': (fact) =>
    byActor(
      fact,
      orderOpening(fact),
      openings(fact) === null ? [] : ['ordersOpenToB2b', 'ordersOpenToB2c', 'previous'],
    ),
} satisfies Partial<Record<JournalFactType, Phrase>>;
