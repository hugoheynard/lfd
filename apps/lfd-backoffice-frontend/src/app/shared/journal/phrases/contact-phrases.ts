import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  byActor,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **« Nous écrire »** (`documentation/order/plan-nous-ecrire.md`, §5.7) — le
 * miroir de `contact_message.handled` dans `@lfd/contracts`. La charge ne
 * porte que l'objet du message, figé à la réception : ni l'auteur ni le texte,
 * que l'anonymisation viderait de toute façon.
 */
function handled(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return [
    text(
      label === null
        ? 'a marqué traité un message de contact'
        : `a marqué traité un message de contact « ${label} »`,
    ),
  ];
}

export const CONTACT_PHRASES = {
  'contact_message.handled': (fact) => byActor(fact, handled(fact), ['subjectLabel']),
} satisfies Partial<Record<JournalFactType, Phrase>>;
