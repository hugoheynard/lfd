import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional } from '../payload-read';
import { byActor, cite, name, subject, subjectLabelOf, text, value, type Phrase } from '../phrase';
import { ENTITY } from './accounting-phrases';

/**
 * **Le lot rejeté par la banque** (plan `plan-lot-rejete-par-la-banque.md`) —
 * famille `accounting`. À part d'`accounting-phrases.ts`, qui dépasse déjà la
 * taille d'un fichier.
 *
 * « … a déclaré le fichier du lot « Lot B2B 202609 » de l'entité « X »
 * rejeté par la banque (PSR1) : « motif ». 3 commandes redeviennent à
 * prélever. »
 */
const rejectedByBank: Phrase = (fact) => {
  const label = subjectLabelOf(fact);
  const released = fact.payload['releasedOrderCount'];
  return byActor(
    fact,
    [
      text('a déclaré le fichier '),
      ...(label === null
        ? [text('d’un lot')]
        : [text('du lot « '), subject(fact, label), text(' »')]),
      text(' de '),
      ...cite(ENTITY[''], fact.payload['legalEntity']),
      text(' rejeté par la banque (PSR1) : « '),
      name(optional(fact.payload['reason']) ?? '—'),
      text(' ». '),
      value(`${typeof released === 'number' ? String(released) : '?'} commande(s)`),
      text(' redeviennent à prélever'),
    ],
    [
      'subjectLabel',
      'legalEntity',
      'scheme',
      'cycleClosesAt',
      'lineCount',
      'totalCents',
      'reason',
      'releasedOrderCount',
    ],
  );
};

export const COLLECTION_BATCH_REJECTION_PHRASES = {
  'collection.batch_rejected_by_bank': rejectedByBank,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
