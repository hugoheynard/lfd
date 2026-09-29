import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, optional } from '../payload-read';
import {
  byActor,
  cite,
  citePerson,
  countOf,
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
 * **Le chargement** (`plan-preparation-de-tournee.md`, lot 4, v4) — le miroir
 * de `DELIVERY_LOADING_FACTS` dans `@lfd/contracts`.
 *
 * Le sujet d'un fait de sac est le sac, nommé par son code court — celui
 * qu'on lit sous le QR. La déclaration, elle, a la commande pour sujet : elle
 * crée plusieurs sacs d'un coup. Le départ a la tournée.
 */

const ORDER: Noun = { the: 'de la commande', a: 'd’une commande' };
const BAG: Noun = { the: '', a: 'un sac' };

/** « le sac « ABC234 » » — le code court, en gras. */
function bag(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null ? [text('un sac')] : [text('le sac « '), subject(fact, label), text(' »')];
}

/** « la tournée « Kangoo » du 1 octobre 2026, passage 2 » — citée depuis un sac. */
function roundOf(fact: PhraseFact): Segment[] {
  const day = optional(fact.payload['day']);
  const passage = count(fact.payload['passage']);
  return [
    ...cite({ the: 'la tournée', a: 'une tournée' }, fact.payload['round']),
    ...(day === null ? [] : [text(' du '), inUnit('day', day)]),
    ...(passage === null || passage <= 1 ? [] : [text(', passage '), value(String(passage))]),
  ];
}

const BAG_ROUND_KEYS = ['subjectLabel', 'order', 'round', 'day', 'passage'] as const;

/** « « ABC234 », « ABC235 » » — les sacs créés, par leur code. */
function bagList(raw: unknown): Segment[] {
  const bags: readonly unknown[] = Array.isArray(raw) ? raw : [];
  return bags.flatMap((cited, index) => {
    const said = cite(BAG, cited);
    return index === 0 ? said : [text(', '), ...said];
  });
}

/** Par le QR, ou par le code tapé : l'attestation n'est pas la même. */
function via(raw: unknown): Segment[] {
  switch (optional(raw)) {
    case 'scan':
      return [text(', par son QR')];
    case 'code':
      return [text(', par son code tapé')];
    default:
      return [];
  }
}

export const DELIVERY_LOADING_PHRASES = {
  'delivery_bag.declared': (fact) => {
    const bags: readonly unknown[] = Array.isArray(fact.payload['bags'])
      ? fact.payload['bags']
      : [];
    const label = subjectLabelOf(fact);
    return byActor(
      fact,
      [
        text(`a déclaré ${bags.length > 1 ? `${String(bags.length)} sacs` : 'un sac'} pour `),
        ...(label === null
          ? [text('une commande')]
          : [text('la commande « '), subject(fact, label), text(' »')]),
        ...(bags.length === 0 ? [] : [text(' : '), ...bagList(bags)]),
      ],
      ['subjectLabel', 'bags'],
    );
  },
  'delivery_bag.voided': (fact) =>
    byActor(
      fact,
      [text('a annulé '), ...bag(fact), text(' '), ...cite(ORDER, fact.payload['order'])],
      ['subjectLabel', 'order'],
    ),
  'delivery_bag.loaded': (fact) =>
    byActor(
      fact,
      [
        text('a chargé '),
        ...bag(fact),
        text(' '),
        ...cite(ORDER, fact.payload['order']),
        text(' dans '),
        ...roundOf(fact),
        ...via(fact.payload['via']),
      ],
      [...BAG_ROUND_KEYS, 'via'],
    ),
  // Le fait garde qui avait chargé, et quand : décharger efface la ligne.
  'delivery_bag.unloaded': (fact) =>
    byActor(
      fact,
      [
        text('a déchargé '),
        ...bag(fact),
        text(' '),
        ...cite(ORDER, fact.payload['order']),
        text(' de '),
        ...roundOf(fact),
        text(' — chargé le '),
        inUnit('instant', fact.payload['loadedAt']),
        text(' par '),
        ...citePerson(fact.payload['loadedBy'], 'quelqu’un'),
      ],
      [...BAG_ROUND_KEYS, 'loadedAt', 'loadedBy'],
    ),
  'delivery_round.departed': (fact) => {
    const label = subjectLabelOf(fact);
    const day = optional(fact.payload['day']);
    const passage = count(fact.payload['passage']);
    const stops = countOf(fact.payload['stops'], 'arrêt', 'arrêts');
    const bags = countOf(fact.payload['bags'], 'sac', 'sacs');
    return byActor(
      fact,
      [
        text('a fait partir '),
        ...(label === null
          ? [text('une tournée')]
          : [text('la tournée « '), subject(fact, label), text(' »')]),
        ...(day === null ? [] : [text(' du '), inUnit('day', day)]),
        ...(passage === null || passage <= 1 ? [] : [text(', passage '), value(String(passage))]),
        ...(stops === null ? [] : [text(' : '), stops]),
        ...(bags === null ? [] : [text(', '), bags]),
      ],
      ['subjectLabel', 'day', 'passage', 'stops', 'bags'],
    );
  },
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
