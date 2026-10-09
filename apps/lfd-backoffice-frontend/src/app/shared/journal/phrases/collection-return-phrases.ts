import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional } from '../payload-read';
import {
  byActor,
  cite,
  inUnit,
  name,
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
import {
  COLLECTION_RETURN_KIND,
  COLLECTION_RETURN_RESOLUTION,
  COLLECTION_RETURN_SOURCE,
} from '../values/accounting-values';

/**
 * **Les retours bancaires** (plan `retours-bancaires.md`) — famille
 * `accounting`. Sujet : la société payeuse. À part d'`accounting-phrases.ts`,
 * qui dépasse déjà la taille d'un fichier. Jamais d'IBAN : la ligne se dit par
 * son lot et son `EndToEndId`.
 */

const BATCH: Noun = { the: 'du lot', a: 'd’un lot' };

/** Ce que les deux faits disent de la ligne : payeur, lot, montant, motif, jour. */
function returnedLine(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return [
    text('le prélèvement '),
    ...(label === null ? [text('d’un client')] : [text('de « '), subject(fact, label), text(' »')]),
    text(' '),
    ...cite(BATCH, fact.payload['batch']),
    text(' — '),
    inUnit('cents', fact.payload['amountCents']),
    text(', '),
    valueIn(COLLECTION_RETURN_KIND, fact.payload['kind'], { inSentence: true }),
    text(' le '),
    inUnit('day', fact.payload['returnedOn']),
    text(' ('),
    value(optional(fact.payload['reasonCode']) ?? '?'),
    text(' : '),
    name(optional(fact.payload['reason']) ?? '—'),
    text(')'),
  ];
}

const COMMON = [
  'subjectLabel',
  'batch',
  'endToEndId',
  'kind',
  'reasonCode',
  'reason',
  'returnedOn',
  'amountCents',
] as const;

const returned: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a enregistré le retour bancaire sur '),
      ...returnedLine(fact),
      text(' — '),
      valueIn(COLLECTION_RETURN_SOURCE, fact.payload['source'], { inSentence: true }),
      ...(fact.payload['proposesRevocation'] === true
        ? [text(' ; le motif dit que le mandat ne tient plus')]
        : []),
    ],
    [...COMMON, 'feeCents', 'source', 'proposesRevocation'],
  );

const resolved: Phrase = (fact) => {
  const note = fact.payload['note'];
  return byActor(
    fact,
    [
      text('a traité le retour bancaire sur '),
      ...returnedLine(fact),
      text(' : '),
      valueIn(COLLECTION_RETURN_RESOLUTION, fact.payload['resolution'], { inSentence: true }),
      ...(typeof note === 'string' ? [text(' — « '), name(note), text(' »')] : []),
    ],
    [...COMMON, 'resolution', 'note'],
  );
};

export const COLLECTION_RETURN_PHRASES = {
  'collection.returned': returned,
  'collection.return_resolved': resolved,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
