import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  byActor,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/** Ce qu'on a traité, selon le type de la demande. */
const WHAT: Readonly<Record<string, string>> = {
  contact: 'un message de contact',
  order_problem: 'un problème de commande',
};

/**
 * **Les demandes clients** (`documentation/contenu-ecommerce/demandes-clients.md`)
 * — le miroir de `customer_request.handled` dans `@lfd/contracts`, qui a
 * remplacé `contact_message.handled`. La charge ne porte que le motif, figé à
 * la réception, et le type : ni l'auteur ni le texte, que l'anonymisation
 * viderait de toute façon.
 */
function handled(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  const kind = fact.payload['kind'];
  const what = (typeof kind === 'string' ? WHAT[kind] : undefined) ?? 'une demande client';
  return [
    text(label === null ? `a marqué traité ${what}` : `a marqué traité ${what} « ${label} »`),
  ];
}

export const CONTACT_PHRASES = {
  'customer_request.handled': (fact) => byActor(fact, handled(fact), ['subjectLabel', 'kind']),
} satisfies Partial<Record<JournalFactType, Phrase>>;
