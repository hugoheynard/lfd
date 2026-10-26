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
  COLLECTION_RETURN_SOURCE,
  SEPA_SCHEME,
  TEST_SEQUENCE,
} from '../values/accounting-values';

/**
 * **Le prélèvement d'essai et nos établissements** (plan
 * `plan-prelevement-d-essai.md`) — famille `accounting`. Sujet : la société.
 * À part d'`accounting-phrases.ts`, qui dépasse déjà la taille d'un fichier.
 * Jamais d'IBAN ni de RUM : un essai se dit par son `MsgId` (`ESS-…`).
 */

const ENTITY: Noun = { the: 'sous l’entité', a: 'sous une entité' };

function company(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null ? [text('une société')] : [text('« '), subject(fact, label), text(' »')];
}

/** « l'essai ESS-… de 1,00 € sur « Folie Douce Val » ». */
function testOn(fact: PhraseFact): Segment[] {
  return [
    text('l’essai '),
    value(optional(fact.payload['messageId']) ?? '?'),
    text(' de '),
    inUnit('cents', fact.payload['amountCents']),
    text(' sur '),
    ...company(fact),
  ];
}

const declared: Phrase = (fact) =>
  byActor(
    fact,
    [text('a déclaré '), ...company(fact), text(' parmi nos établissements')],
    ['subjectLabel'],
  );

const withdrawn: Phrase = (fact) =>
  byActor(
    fact,
    [text('a retiré '), ...company(fact), text(' de nos établissements')],
    ['subjectLabel'],
  );

const generated: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a généré '),
      ...testOn(fact),
      text(' — '),
      valueIn(TEST_SEQUENCE, fact.payload['sequence'], { inSentence: true }),
      text(', '),
      valueIn(SEPA_SCHEME, fact.payload['scheme'], { inSentence: true }),
      text(', échéance le '),
      inUnit('day', fact.payload['collectionDay']),
      text(' '),
      ...cite(ENTITY, fact.payload['legalEntity']),
    ],
    [
      'subjectLabel',
      'messageId',
      'amountCents',
      'sequence',
      'scheme',
      'collectionDay',
      'legalEntity',
    ],
  );

const refunded: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a marqué remboursé '),
      ...testOn(fact),
      text(', le '),
      inUnit('day', fact.payload['refundedOn']),
    ],
    ['subjectLabel', 'messageId', 'amountCents', 'refundedOn'],
  );

const returned: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a rattaché le retour bancaire de '),
      ...testOn(fact),
      text(' : '),
      valueIn(COLLECTION_RETURN_KIND, fact.payload['kind'], { inSentence: true }),
      text(' le '),
      inUnit('day', fact.payload['returnedOn']),
      text(' ('),
      value(optional(fact.payload['reasonCode']) ?? '?'),
      text(' : '),
      name(optional(fact.payload['reason']) ?? '—'),
      text(') — '),
      valueIn(COLLECTION_RETURN_SOURCE, fact.payload['source'], { inSentence: true }),
    ],
    [
      'subjectLabel',
      'messageId',
      'amountCents',
      'kind',
      'reasonCode',
      'reason',
      'returnedOn',
      'source',
    ],
  );

const bankAccountExported: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a exporté pour la banque le RIB de '),
      ...company(fact),
      text(' '),
      ...cite(ENTITY, fact.payload['legalEntity']),
      text(', depuis l’essai'),
    ],
    ['subjectLabel', 'legalEntity'],
  );

export const COLLECTION_TEST_PHRASES = {
  'collection.own_establishment_declared': declared,
  'collection.own_establishment_withdrawn': withdrawn,
  'collection.test_generated': generated,
  'collection.test_refunded': refunded,
  'collection.test_returned': returned,
  'collection.test_bank_account_exported': bankAccountExported,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
