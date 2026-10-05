import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  byActor,
  cite,
  countOf,
  subject,
  subjectLabelOf,
  text,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **Les contenants du colisage** (K2b, 2026-10-04,
 * `colisage/colisage.md`) — le miroir de
 * `PACKING_CONTAINER_FACTS` dans `@lfd/contracts`.
 *
 * Le sujet est la commande ; le contenant est cité par son code de bac, ou
 * « sac ».
 */

/** Sans article : la préposition change (« dans le », « du »), le nom reste. */
const CONTAINER: Noun = { the: '', a: 'un contenant' };

/** « de la commande ORD-0001 » — « d'une commande » sans numéro. */
function theOrder(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text('d’une commande')]
    : [text('de la commande '), subject(fact, label)];
}

/** « 12 « Croissant » » : la quantité, puis l'article nommé du moment. */
function pieces(fact: PhraseFact): Segment[] {
  const quantity = countOf(fact.payload['quantity'], 'pièce', 'pièces');
  const name = typeof fact.payload['productName'] === 'string' ? fact.payload['productName'] : '';
  return [...(quantity === null ? [] : [quantity]), text(` « ${name} »`)];
}

const MOVED_KEYS = ['subjectLabel', 'container', 'sku', 'productName', 'quantity'];

export const PACKING_CONTAINER_PHRASES = {
  'packing_container.opened': (fact) =>
    byActor(
      fact,
      [
        text(fact.payload['nature'] === 'bag' ? 'a ouvert ' : 'a ouvert le bac '),
        ...cite(CONTAINER, fact.payload['container']),
        text(' '),
        ...theOrder(fact),
      ],
      ['subjectLabel', 'container', 'nature'],
    ),
  'packing_container.filled': (fact) =>
    byActor(
      fact,
      [
        text('a glissé '),
        ...pieces(fact),
        text(' dans le contenant '),
        ...cite(CONTAINER, fact.payload['container']),
        text(' '),
        ...theOrder(fact),
      ],
      MOVED_KEYS,
    ),
  'packing_container.emptied': (fact) =>
    byActor(
      fact,
      [
        text('a retiré '),
        ...pieces(fact),
        text(' du contenant '),
        ...cite(CONTAINER, fact.payload['container']),
        text(' '),
        ...theOrder(fact),
      ],
      MOVED_KEYS,
    ),
  'packing_container.voided': (fact) =>
    byActor(
      fact,
      [
        text('a annulé le contenant '),
        ...cite(CONTAINER, fact.payload['container']),
        text(' '),
        ...theOrder(fact),
      ],
      ['subjectLabel', 'container'],
    ),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
