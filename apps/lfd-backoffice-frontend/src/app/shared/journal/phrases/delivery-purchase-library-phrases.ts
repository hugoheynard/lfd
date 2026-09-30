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
import { formatUnit } from '../units';

/**
 * **La bibliothèque d'achat** (`plan-bibliotheque-d-achat.md`, lot B1) — le
 * miroir des faits `delivery_purchase_vehicle_candidate.*` et
 * `delivery_purchase_bin_candidate.*` dans `@lfd/contracts`.
 *
 * Un candidat se dit en entier ; une correction ne dit que ce qui a changé,
 * avant et après. Le prix est HT, et un prix absent se dit « inconnu » —
 * jamais zéro.
 */

interface Trait {
  readonly key: string;
  readonly say: (raw: unknown) => string;
}

/** « 60 × 40 × 30 cm », ou « — » sur une charge incomplète. */
function dimensions(raw: unknown, keys: readonly string[]): string {
  const d = recordOf(raw);
  const sides = keys.map((key) => count(d?.[key]));
  return sides.some((side) => side === null)
    ? '—'
    : `${sides.map((side) => String(side)).join(' × ')} cm`;
}

const BOX = ['lengthCm', 'widthCm', 'heightCm'];

function price(label: string): (raw: unknown) => string {
  return (raw) => {
    const formatted = raw === null ? null : formatUnit('cents', raw);
    return formatted === null ? `${label} inconnu` : `${label} ${formatted}`;
  };
}

const LISTING: readonly Trait[] = [
  { key: 'reference', say: (raw) => `référence ${optional(raw) ?? 'non renseignée'}` },
  {
    key: 'purchaseUrl',
    say: (raw) => (optional(raw) === null ? 'sans lien d’achat' : `lien d’achat ${optional(raw)}`),
  },
];

const VEHICLE_TRAITS: readonly Trait[] = [
  { key: 'name', say: (raw) => `« ${optional(raw) ?? '—'} »` },
  { key: 'cargo', say: (raw) => `chargement ${dimensions(raw, BOX)}` },
  {
    key: 'wheelArches',
    say: (raw) =>
      raw === null
        ? 'sans passages de roue'
        : `passages de roue ${dimensions(raw, ['lengthCm', 'protrusionCm', 'fromBackCm', 'heightCm'])} (longueur × saillie × depuis le fond × hauteur)`,
  },
  ...LISTING,
  { key: 'priceCentsExclVat', say: price('prix HT') },
];

const BIN_TRAITS: readonly Trait[] = [
  { key: 'name', say: (raw) => `« ${optional(raw) ?? '—'} »` },
  { key: 'outer', say: (raw) => `extérieur ${dimensions(raw, BOX)}` },
  { key: 'inner', say: (raw) => `intérieur ${dimensions(raw, BOX)}` },
  { key: 'isotherm', say: (raw) => (raw === true ? 'isotherme' : 'sec') },
  {
    key: 'maxStack',
    say: (raw) => {
      const stack = count(raw);
      return stack === null ? 'pile —' : `pile de ${String(stack)} au plus`;
    },
  },
  { key: 'supplier', say: (raw) => `fournisseur ${optional(raw) ?? 'non renseigné'}` },
  ...LISTING,
  { key: 'unitPriceCentsExclVat', say: price('prix unitaire HT') },
];

interface Kind {
  readonly the: string;
  readonly a: string;
  readonly traits: readonly Trait[];
}

const VEHICLE: Kind = {
  the: 'le véhicule candidat',
  a: 'un véhicule candidat',
  traits: VEHICLE_TRAITS,
};
const BIN: Kind = { the: 'le format candidat', a: 'un format de bac candidat', traits: BIN_TRAITS };

function theCandidate(kind: Kind, fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text(kind.a)]
    : [text(`${kind.the} « `), subject(fact, label), text(' »')];
}

/** Toutes les caractéristiques, hors le nom déjà dit. */
function candidateTerms(kind: Kind, raw: unknown): Segment[] {
  const candidate: Payload = recordOf(raw) ?? {};
  return [
    value(
      kind.traits
        .filter((trait) => trait.key !== 'name')
        .map((trait) => trait.say(candidate[trait.key] ?? null))
        .join(', '),
    ),
  ];
}

/** Ce qui a changé, avant et après. */
function changedTerms(kind: Kind, before: unknown, after: unknown): Segment[] {
  const from: Payload = recordOf(before) ?? {};
  const to: Payload = recordOf(after) ?? {};
  const changed = kind.traits.filter(
    (trait) => JSON.stringify(from[trait.key]) !== JSON.stringify(to[trait.key]),
  );
  if (changed.length === 0) {
    return [text(' (aucun changement)')];
  }
  return changed.flatMap((trait, index) => [
    text(index === 0 ? ' : ' : ' ; '),
    ...fromTo(
      [value(trait.say(from[trait.key] ?? null))],
      [value(trait.say(to[trait.key] ?? null))],
    ),
  ]);
}

function onCandidate(kind: Kind, verb: string): Phrase {
  return (fact): Said =>
    byActor(
      fact,
      [
        text(`${verb} `),
        ...theCandidate(kind, fact),
        text(' ('),
        ...candidateTerms(kind, fact.payload['candidate']),
        text(')'),
      ],
      ['subjectLabel', 'candidate'],
    );
}

function corrected(kind: Kind): Phrase {
  return (fact): Said =>
    byActor(
      fact,
      [
        text('a corrigé '),
        ...theCandidate(kind, fact),
        ...changedTerms(kind, fact.payload['before'], fact.payload['after']),
      ],
      ['subjectLabel', 'before', 'after'],
    );
}

export const DELIVERY_PURCHASE_LIBRARY_PHRASES = {
  'delivery_purchase_vehicle_candidate.declared': onCandidate(
    VEHICLE,
    'a ajouté à la bibliothèque d’achat',
  ),
  'delivery_purchase_vehicle_candidate.corrected': corrected(VEHICLE),
  'delivery_purchase_vehicle_candidate.archived': onCandidate(VEHICLE, 'a archivé'),
  'delivery_purchase_vehicle_candidate.reactivated': onCandidate(VEHICLE, 'a réactivé'),
  'delivery_purchase_bin_candidate.declared': onCandidate(
    BIN,
    'a ajouté à la bibliothèque d’achat',
  ),
  'delivery_purchase_bin_candidate.corrected': corrected(BIN),
  'delivery_purchase_bin_candidate.archived': onCandidate(BIN, 'a archivé'),
  'delivery_purchase_bin_candidate.reactivated': onCandidate(BIN, 'a réactivé'),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
