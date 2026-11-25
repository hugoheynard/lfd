import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  subject,
  subjectLabelOf,
  said,
  text,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **Le reliquat de commande** (`documentation/commandes/reliquat/reliquat.md`, § 6.1) —
 * `backorder.*`, famille `ordersAndProduction`. Le sujet est la commande
 * d'origine ; le détail rend les lignes du reste et la commande issue.
 */

/** « la commande CMD-142 », liée à sa fiche ; « une commande » sans libellé. */
function origin(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null ? [text('une commande')] : [text('la commande '), subject(fact, label)];
}

const opened: Phrase = (fact) =>
  said(
    [text('Un reliquat est ouvert pour ce qui n’est pas parti de '), ...origin(fact)],
    ['subjectLabel'],
  );

const converted: Phrase = (fact) => {
  const number = fact.payload['orderNumber'];
  return said(
    [
      text('Le reliquat de '),
      ...origin(fact),
      text(' est transformé en commande'),
      ...(typeof number === 'string' && number !== '' ? [text(` ${number}`)] : []),
    ],
    ['subjectLabel', 'orderNumber'],
  );
};

const abandoned: Phrase = (fact) =>
  said([text('Le reliquat de '), ...origin(fact), text(' est abandonné')], ['subjectLabel']);

export const BACKORDER_PHRASES = {
  'backorder.opened': opened,
  'backorder.converted': converted,
  'backorder.abandoned': abandoned,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
