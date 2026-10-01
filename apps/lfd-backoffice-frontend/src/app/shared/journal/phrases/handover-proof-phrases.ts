import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  byActor,
  inUnit,
  subject,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
  type Segment,
  valueIn,
} from '../phrase';
import { HANDOVER_PROOF_ERASURE_CAUSE } from '../values/orders-values';

/**
 * **Les pièces d'une remise à la porte, effacées** (2026-10-01,
 * `documentation/livraisons/todo-la-porte.md`) — le miroir de
 * `HANDOVER_PROOF_FACTS` dans `@lfd/contracts`.
 *
 * La charge ne porte rien de personnel : la phrase dit la commande, quand la
 * pièce avait été prise, ce qu'elle contenait et pourquoi elle est partie.
 */

/** « de la commande ORD-0001 » — « d'une commande » quand le commerce ne la connaît plus. */
function theOrder(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text('d’une commande')]
    : [text('de la commande '), subject(fact, label)];
}

export const HANDOVER_PROOF_PHRASES = {
  'order_handover_proof.erased': (fact) =>
    byActor(
      fact,
      [
        text('a effacé les preuves de livraison '),
        ...theOrder(fact),
        text(
          fact.payload['signed'] === true
            ? ' (photo et signature, prises le '
            : ' (photo, prise le ',
        ),
        inUnit('instant', fact.payload['recordedAt']),
        text(') : '),
        valueIn(HANDOVER_PROOF_ERASURE_CAUSE, fact.payload['cause'], { inSentence: true }),
      ],
      ['subjectLabel', 'recordedAt', 'signed', 'cause'],
    ),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
