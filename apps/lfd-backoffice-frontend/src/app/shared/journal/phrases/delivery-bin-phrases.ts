import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, optional, recordOf, type Payload } from '../payload-read';
import {
  byActor,
  fromTo,
  subject,
  subjectLabelOf,
  text,
  value,
  type Phrase,
  type PhraseFact,
  type Said,
  type Segment,
} from '../phrase';

/**
 * **Les bacs de la livraison** (`plan-preparation-de-tournee.md`, lot 4 bis
 * v2, tranche A) — le miroir des faits `delivery_bin_type.*` et
 * `delivery_bin_capacity.set` dans `@lfd/contracts`.
 *
 * Un type se dit en entier : six caractéristiques tiennent en une phrase. Une
 * correction ne dit que ce qui a changé, avant et après.
 */

/** Le type de bac, en gras — « un type de bac » sur une ligne sans libellé. */
function theBin(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text('un type de bac')]
    : [text('le type de bac « '), subject(fact, label), text(' »')];
}

/** Millimètres dans un centimètre. */
const MM_PER_CM = 10;

/** `665` mm → « 66,5 », `460` → « 46 ». */
function centimetresOfMm(mm: number): string {
  return (mm / MM_PER_CM).toLocaleString('fr-FR', { maximumFractionDigits: 1, useGrouping: false });
}

/**
 * « 66,5 × 46 × 71,5 cm », ou « — » sur une charge incomplète. Une fiche se
 * trace en mm depuis le 2026-10-07 ; les faits d'avant portent des cm entiers,
 * et se lisent toujours. Les bacs candidats de la bibliothèque d'achat suivent
 * la même règle, et la même lecture.
 */
export function binDimensionsPhrase(raw: unknown): string {
  const d = recordOf(raw);
  const mm = [d?.['lengthMm'], d?.['widthMm'], d?.['heightMm']].map(count);
  if (mm.every((side) => side !== null)) {
    return `${mm.map((side) => centimetresOfMm(side ?? 0)).join(' × ')} cm`;
  }
  const sides = [d?.['lengthCm'], d?.['widthCm'], d?.['heightCm']].map(count);
  return sides.some((side) => side === null)
    ? '—'
    : `${sides.map((side) => String(side)).join(' × ')} cm`;
}

/** Chaque caractéristique d'un type, dite sur elle-même. */
const TRAITS: readonly {
  readonly key: string;
  readonly say: (raw: unknown) => string;
}[] = [
  { key: 'name', say: (raw) => `« ${optional(raw) ?? '—'} »` },
  { key: 'outer', say: (raw) => `extérieur ${binDimensionsPhrase(raw)}` },
  { key: 'inner', say: (raw) => `intérieur ${binDimensionsPhrase(raw)}` },
  { key: 'isotherm', say: (raw) => (raw === true ? 'isotherme' : 'sec') },
  {
    key: 'maxStack',
    say: (raw) => {
      const stack = count(raw);
      return stack === null ? 'pile —' : `pile de ${String(stack)} au plus`;
    },
  },
  { key: 'divisible', say: (raw) => (raw === true ? 'cloisonnable' : 'sans cloison') },
];

/** « extérieur 60 × 40 × 30 cm, intérieur …, sec, pile de 5 au plus, cloisonnable ». */
function binTerms(raw: unknown): Segment[] {
  const bin: Payload = recordOf(raw) ?? {};
  return [
    value(
      TRAITS.filter((trait) => trait.key !== 'name')
        .map((trait) => trait.say(bin[trait.key]))
        .join(', '),
    ),
  ];
}

/** « : pile de 5 au plus à pile de 4 au plus ; sec à isotherme » — ce qui a changé. */
function changedTerms(before: unknown, after: unknown): Segment[] {
  const from: Payload = recordOf(before) ?? {};
  const to: Payload = recordOf(after) ?? {};
  const changed = TRAITS.filter(
    (trait) => JSON.stringify(from[trait.key]) !== JSON.stringify(to[trait.key]),
  );
  if (changed.length === 0) {
    return [text(' (aucun changement)')];
  }
  return changed.flatMap((trait, index) => [
    text(index === 0 ? ' : ' : ' ; '),
    ...fromTo([value(trait.say(from[trait.key]))], [value(trait.say(to[trait.key]))]),
  ]);
}

function onBin(verb: string): Phrase {
  return (fact): Said =>
    byActor(
      fact,
      [text(`${verb} `), ...theBin(fact), text(' ('), ...binTerms(fact.payload['bin']), text(')')],
      ['subjectLabel', 'bin'],
    );
}

/** « 24 unités », ou « aucune » pour une case sans contenance. */
function units(raw: unknown): Segment {
  const n = count(raw);
  if (n === null) return value('aucune');
  return value(n === 1 ? '1 unité' : `${n.toLocaleString('fr-FR')} unités`);
}

function capacitySet(fact: PhraseFact): Said {
  const sku = optional(fact.payload['sku']) ?? '—';
  const before = fact.payload['before'];
  const after = fact.payload['after'];
  const removed = count(after) === null;
  return byActor(
    fact,
    [
      text(removed ? 'a retiré la contenance de ' : 'a fixé la contenance de '),
      value(sku),
      text(' dans '),
      ...theBin(fact),
      ...(removed
        ? [text(' (c’était '), units(before), text(')')]
        : [text(' '), ...fromTo([units(before)], [units(after)]), text(' par bac entier')]),
    ],
    ['subjectLabel', 'sku', 'before', 'after'],
  );
}

export const DELIVERY_BIN_PHRASES = {
  'delivery_bin_type.added': onBin('a ajouté'),
  'delivery_bin_type.corrected': (fact) =>
    byActor(
      fact,
      [
        text('a corrigé '),
        ...theBin(fact),
        ...changedTerms(fact.payload['before'], fact.payload['after']),
      ],
      ['subjectLabel', 'before', 'after'],
    ),
  'delivery_bin_type.archived': onBin('a archivé'),
  'delivery_bin_type.reactivated': onBin('a réactivé'),
  'delivery_bin_capacity.set': capacitySet,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
