import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, optional, recordOf } from '../payload-read';
import { BIN_HALF } from '../values/orders-values';
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
  valueIn,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **Le chargement** (`plan-preparation-de-tournee.md`, lot 4, v4 ; lot 4 bis,
 * tranche B) — le miroir de `DELIVERY_LOADING_FACTS` dans `@lfd/contracts`.
 *
 * Le sujet d'un fait de bac est le bac, nommé par son code court — celui
 * qu'on lit sous le QR. La déclaration et le partage, eux, ont la commande
 * pour sujet : la déclaration crée plusieurs bacs d'un coup. Le départ a la
 * tournée.
 */

const ORDER: Noun = { the: 'de la commande', a: 'd’une commande' };
const BIN: Noun = { the: '', a: 'un bac' };
const BIN_TYPE: Noun = { the: 'de type', a: 'd’un type' };

/** « le bac « ABC234 » » — le code court, en gras. */
function bin(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null ? [text('un bac')] : [text('le bac « '), subject(fact, label), text(' »')];
}

/** « la commande « CMD-1 » » — la commande sujet d'une déclaration ou d'un partage. */
function theOrder(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text('une commande')]
    : [text('la commande « '), subject(fact, label), text(' »')];
}

/** « la tournée « Kangoo » du 1 octobre 2026, passage 2 » — citée depuis un bac. */
function roundOf(fact: PhraseFact): Segment[] {
  const day = optional(fact.payload['day']);
  const passage = count(fact.payload['passage']);
  return [
    ...cite({ the: 'la tournée', a: 'une tournée' }, fact.payload['round']),
    ...(day === null ? [] : [text(' du '), inUnit('day', day)]),
    ...(passage === null || passage <= 1 ? [] : [text(', passage '), value(String(passage))]),
  ];
}

const BIN_ROUND_KEYS = ['subjectLabel', 'order', 'round', 'day', 'passage'] as const;

/** « ½ gauche » — le côté d'une moitié, par son mot ; rien pour un bac entier. */
function halfOf(raw: unknown): Segment[] {
  return optional(raw) === null ? [] : [text(' '), valueIn(BIN_HALF, raw, { inSentence: true })];
}

/** « « ABC234 », « ABC235 » ½ gauche » — les bacs créés, par leur code et leur moitié. */
function binList(raw: unknown): Segment[] {
  const bins: readonly unknown[] = Array.isArray(raw) ? raw : [];
  return bins.flatMap((entry, index) => {
    const item = recordOf(entry);
    const said = [...cite(BIN, item?.['bin']), ...halfOf(item?.['half'])];
    return index === 0 ? said : [text(', '), ...said];
  });
}

/** « , 2 sacs dans chacun » — rien quand aucun sac n'y est posé. */
function innerBagsOf(raw: unknown, each: boolean): Segment[] {
  const bags = count(raw);
  if (bags === null || bags === 0) {
    return [];
  }
  return [
    text(', '),
    value(`${String(bags)} sac${bags > 1 ? 's' : ''}`),
    text(each ? ' dans chacun' : ' dedans'),
  ];
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
  'delivery_bin.declared': (fact) => {
    const bins: readonly unknown[] = Array.isArray(fact.payload['bins'])
      ? fact.payload['bins']
      : [];
    return byActor(
      fact,
      [
        text(`a déclaré ${bins.length > 1 ? `${String(bins.length)} bacs` : 'un bac'} `),
        ...cite(BIN_TYPE, fact.payload['binType']),
        text(' pour '),
        ...theOrder(fact),
        ...innerBagsOf(fact.payload['innerBags'], bins.length > 1),
        ...(bins.length === 0 ? [] : [text(' : '), ...binList(bins)]),
      ],
      ['subjectLabel', 'binType', 'innerBags', 'bins'],
    );
  },
  'delivery_bin.shared': (fact) =>
    byActor(
      fact,
      [
        text('a partagé un bac '),
        ...cite(BIN_TYPE, fact.payload['binType']),
        text(' entre '),
        ...theOrder(fact),
        text(' et '),
        ...cite({ the: 'la commande', a: 'une commande' }, fact.payload['partnerOrder']),
        text(' : '),
        ...cite(BIN, fact.payload['bin']),
        ...halfOf(fact.payload['half']),
        text(', face à '),
        ...cite(BIN, fact.payload['partner']),
        ...innerBagsOf(fact.payload['innerBags'], false),
      ],
      ['subjectLabel', 'binType', 'innerBags', 'bin', 'half', 'partner', 'partnerOrder'],
    ),
  'delivery_bin.voided': (fact) =>
    byActor(
      fact,
      [text('a annulé '), ...bin(fact), text(' '), ...cite(ORDER, fact.payload['order'])],
      ['subjectLabel', 'order'],
    ),
  'delivery_bin.loaded': (fact) =>
    byActor(
      fact,
      [
        text('a chargé '),
        ...bin(fact),
        text(' '),
        ...cite(ORDER, fact.payload['order']),
        text(' dans '),
        ...roundOf(fact),
        ...via(fact.payload['via']),
      ],
      [...BIN_ROUND_KEYS, 'via'],
    ),
  // Le fait garde qui avait chargé, et quand : décharger efface la ligne.
  'delivery_bin.unloaded': (fact) =>
    byActor(
      fact,
      [
        text('a déchargé '),
        ...bin(fact),
        text(' '),
        ...cite(ORDER, fact.payload['order']),
        text(' de '),
        ...roundOf(fact),
        text(' — chargé le '),
        inUnit('instant', fact.payload['loadedAt']),
        text(' par '),
        ...citePerson(fact.payload['loadedBy'], 'quelqu’un'),
      ],
      [...BIN_ROUND_KEYS, 'loadedAt', 'loadedBy'],
    ),
  'delivery_round.departed': (fact) => {
    const label = subjectLabelOf(fact);
    const day = optional(fact.payload['day']);
    const passage = count(fact.payload['passage']);
    const stops = countOf(fact.payload['stops'], 'arrêt', 'arrêts');
    const bins = countOf(fact.payload['bins'], 'bac', 'bacs');
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
        ...(bins === null ? [] : [text(', '), bins]),
      ],
      ['subjectLabel', 'day', 'passage', 'stops', 'bins'],
    );
  },
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
