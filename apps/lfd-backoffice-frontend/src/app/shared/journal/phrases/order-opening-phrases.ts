import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import {
  byActor,
  name,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import { factDay } from '../units';

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

const FIRST_DAYS = [
  { key: 'firstServiceDayB2b', of: 'des professionnels' },
  { key: 'firstServiceDayB2c', of: 'des particuliers' },
] as const;

/** Une journée `AAAA-MM-JJ`, `null` pour « aucune », `undefined` si la charge ne la porte pas. */
function dayOf(value: unknown): string | null | undefined {
  return typeof value === 'string' || value === null ? value : undefined;
}

/**
 * **Le premier jour commandable** (plan-premier-jour-commandable.md, J3) :
 * « a ouvert les commandes des particuliers à partir du 30 octobre 2026 ».
 * Les faits antérieurs ne portent pas ces clés : rien n'est dit.
 */
function firstDayChanges(fact: PhraseFact): string[] {
  const previous = recordOf(fact.payload['previous']);
  const said: string[] = [];
  for (const { key, of } of FIRST_DAYS) {
    const after = dayOf(fact.payload[key]);
    const before = dayOf(previous?.[key]);
    if (after === undefined || after === (before ?? null)) {
      continue;
    }
    said.push(
      after === null
        ? `a retiré la date de début des commandes ${of}`
        : `a fixé le début des commandes ${of} au ${factDay(after)}`,
    );
  }
  return said;
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
    ...firstDayChanges(fact),
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

/**
 * **Les exemptions à la fermeture** (décision de Hugo du 2026-10-26) : la
 * société ou l'adresse, nommée au geste. « a laissé commander « Chez Paul »
 * malgré la fermeture de la boutique ».
 */
function exemptionTarget(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  const kind = fact.payload['kind'];
  const what = kind === 'company' ? 'la société ' : kind === 'email' ? 'l’adresse ' : '';
  return label === null ? [text('un client')] : [text(what), name(label)];
}

const EXEMPTION_KEYS = ['subjectLabel', 'kind', 'company'];

export const ORDER_OPENING_PHRASES = {
  'order_opening.updated': (fact) =>
    byActor(
      fact,
      orderOpening(fact),
      openings(fact) === null
        ? []
        : [
            'ordersOpenToB2b',
            'ordersOpenToB2c',
            'firstServiceDayB2b',
            'firstServiceDayB2c',
            'previous',
          ],
    ),
  'order_opening.exemption_granted': (fact) =>
    byActor(
      fact,
      [
        text('a laissé commander '),
        ...exemptionTarget(fact),
        text(' malgré la fermeture de la boutique'),
      ],
      EXEMPTION_KEYS,
    ),
  'order_opening.exemption_withdrawn': (fact) =>
    byActor(
      fact,
      [
        text('a retiré l’exemption de '),
        ...exemptionTarget(fact),
        text(' : la fermeture de la boutique s’y applique de nouveau'),
      ],
      EXEMPTION_KEYS,
    ),
} satisfies Partial<Record<JournalFactType, Phrase>>;
