import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, optional, recordOf } from '../payload-read';
import {
  byActor,
  cite,
  inUnit,
  subject,
  subjectLabelOf,
  text,
  value,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **La composition des tournées** (`plan-preparation-de-tournee.md`, lot 3,
 * C7) — le miroir de `DELIVERY_ROUND_FACTS` dans `@lfd/contracts`.
 *
 * Le sujet est la tournée, nommée par son véhicule ; le jour et le passage la
 * distinguent d'une autre tournée du même véhicule (Q13). Une commande est
 * citée par son numéro, ou par son seul identifiant quand le commerce ne la
 * connaît plus.
 */

const ORDER: Noun = { the: 'la commande', a: 'une commande' };
const ROUND: Noun = { the: 'la tournée', a: 'une tournée' };

/** « passage 2 » — rien au premier passage, comme l'écran. */
function passageOf(raw: unknown): Segment[] {
  const passage = count(raw);
  return passage === null || passage <= 1 ? [] : [text(', passage '), value(String(passage))];
}

/** « la tournée « Kangoo » du 1 octobre 2026, passage 2 ». */
function round(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  const day = optional(fact.payload['day']);
  return [
    ...(label === null
      ? [text('une tournée')]
      : [text('la tournée « '), subject(fact, label), text(' »')]),
    ...(day === null ? [] : [text(' du '), inUnit('day', day)]),
    ...passageOf(fact.payload['passage']),
  ];
}

const ROUND_KEYS = ['subjectLabel', 'day', 'passage'] as const;

/** « en position 3 » — rien si la charge n'a pas figé de rang. */
function atPosition(raw: unknown): Segment[] {
  const position = count(raw);
  return position === null ? [] : [text(' en position '), value(String(position))];
}

/** « CMD-1, CMD-2 » — les commandes dans l'ordre, par leur numéro ou leur identifiant. */
export function orderList(raw: unknown): Segment[] {
  const orders: readonly unknown[] = Array.isArray(raw) ? raw : [];
  if (orders.length === 0) {
    return [text('—')];
  }
  return orders.flatMap((order, index) => {
    const cited = cite({ the: '', a: 'une commande' }, order);
    return index === 0 ? cited : [text(', '), ...cited];
  });
}

export const DELIVERY_ROUND_PHRASES = {
  'delivery_round.opened': (fact) => byActor(fact, [text('a ouvert '), ...round(fact)], ROUND_KEYS),
  'delivery_round.stop_assigned': (fact) =>
    byActor(
      fact,
      [
        text('a affecté '),
        ...cite(ORDER, fact.payload['order']),
        text(' à '),
        ...round(fact),
        ...atPosition(fact.payload['position']),
      ],
      [...ROUND_KEYS, 'order', 'position'],
    ),
  // UN fait pour un déplacement (C7) : le sujet est la tournée d'arrivée.
  'delivery_round.stop_moved': (fact) => {
    const from = recordOf(fact.payload['from']);
    return byActor(
      fact,
      [
        text('a déplacé '),
        ...cite(ORDER, fact.payload['order']),
        text(' de '),
        ...cite(ROUND, from?.['round']),
        ...passageOf(from?.['passage']),
        text(' vers '),
        ...round(fact),
        ...atPosition(fact.payload['position']),
      ],
      [...ROUND_KEYS, 'order', 'from', 'position'],
    );
  },
  'delivery_round.stop_removed': (fact) =>
    byActor(
      fact,
      [text('a retiré '), ...cite(ORDER, fact.payload['order']), text(' de '), ...round(fact)],
      [...ROUND_KEYS, 'order'],
    ),
  'delivery_round.reordered': (fact) =>
    byActor(
      fact,
      [
        text('a réordonné '),
        ...round(fact),
        text(' : de '),
        ...orderList(fact.payload['before']),
        text(' à '),
        ...orderList(fact.payload['after']),
      ],
      [...ROUND_KEYS, 'before', 'after'],
    ),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
