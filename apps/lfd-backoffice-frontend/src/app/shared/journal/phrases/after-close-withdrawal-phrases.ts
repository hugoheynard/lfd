import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional } from '../payload-read';
import {
  byActor,
  name,
  subject,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import { formatUnit } from '../units';

/**
 * **Une commande retirée après l'arrêt du plan** (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * lot A1.3) — le miroir de `AFTER_CLOSE_WITHDRAWAL_FACTS` dans
 * `@lfd/contracts`. Ces deux lignes expliquent, au journal, un compte à
 * produire plus grand que les feuilles du colisage.
 *
 * L'auteur est celui de l'annulation — l'équipe, ou le client lui-même.
 */

/** « du 12 mars 2030 » — la journée, ou « d'une journée » sans date lisible. */
function ofDay(fact: PhraseFact): Segment[] {
  const day = optional(fact.payload['serviceDay']);
  const formatted = day === null ? null : formatUnit('day', day);
  return formatted === null ? [text('d’une journée')] : [text('du '), text(formatted)];
}

export const AFTER_CLOSE_WITHDRAWAL_PHRASES = {
  // « Marie D. a retiré la commande ORD-7 du plan du 12 mars 2030 : annulée
  // après l'arrêt, le compte à produire ne change pas ».
  'production_day.order_withdrawn': (fact) => {
    const day = optional(fact.payload['serviceDay']) ?? subjectLabelOf(fact);
    const formatted = day === null ? null : formatUnit('day', day);
    const number = optional(fact.payload['orderNumber']);
    return byActor(
      fact,
      [
        text('a retiré '),
        ...(number === null ? [text('une commande')] : [text('la commande '), name(number)]),
        text(' du plan '),
        ...(formatted === null ? [text('d’une journée')] : [text('du '), subject(fact, formatted)]),
        text(' : annulée après l’arrêt, le compte à produire ne change pas'),
      ],
      ['subjectLabel', 'serviceDay', 'orderId', 'orderNumber'],
    );
  },
  // « Marie D. a retiré du colisage la feuille de la commande ORD-7 du
  // 12 mars 2030 » — ce qui est revenu à la réserve reste au détail.
  'packing_sheet.withdrawn': (fact) => {
    const label = subjectLabelOf(fact);
    return byActor(
      fact,
      [
        text('a retiré du colisage la feuille '),
        ...(label === null
          ? [text('d’une commande')]
          : [text('de la commande '), subject(fact, label)]),
        text(' '),
        ...ofDay(fact),
        text(' : annulée après l’arrêt du plan'),
      ],
      ['subjectLabel', 'serviceDay'],
    );
  },
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
