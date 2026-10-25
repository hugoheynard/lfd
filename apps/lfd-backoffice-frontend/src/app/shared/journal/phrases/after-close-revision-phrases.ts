import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, entries, optional } from '../payload-read';
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
 * **Les quantités d'une commande changées après l'arrêt du plan** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7) — le miroir de `AFTER_CLOSE_REVISION_FACTS` dans `@lfd/contracts`.
 * Le fournil dit ce qui a monté (« +2 Baguette »), le colisage les lignes
 * dues de → à. L'auteur est l'équipe qui a modifié la commande.
 */

/** « du 12 mars 2030 » — la journée, ou « d'une journée » sans date lisible. */
function ofDay(fact: PhraseFact): Segment[] {
  const day = optional(fact.payload['serviceDay']);
  const formatted = day === null ? null : formatUnit('day', day);
  return formatted === null ? [text('d’une journée')] : [text('du '), text(formatted)];
}

/** « +2 Baguette, −1 Croissant » — l'écart de chaque ligne, nommée. */
function deltas(raw: unknown): string {
  return entries(raw)
    .map((line) => {
      const from = count(line['from']) ?? 0;
      const to = count(line['to']) ?? 0;
      const label = optional(line['productName']) ?? optional(line['sku']) ?? 'un article';
      const delta = to - from;
      return `${delta > 0 ? '+' : '−'}${String(Math.abs(delta))} ${label}`;
    })
    .join(', ');
}

export const AFTER_CLOSE_REVISION_PHRASES = {
  // « Marie D. a monté la commande ORD-7 au plan du 12 mars 2030 :
  // +2 Baguette ».
  'production_day.order_quantities_raised': (fact) => {
    const day = optional(fact.payload['serviceDay']) ?? subjectLabelOf(fact);
    const formatted = day === null ? null : formatUnit('day', day);
    const number = optional(fact.payload['orderNumber']);
    return byActor(
      fact,
      [
        text('a monté '),
        ...(number === null ? [text('une commande')] : [text('la commande '), name(number)]),
        text(' au plan '),
        ...(formatted === null ? [text('d’une journée')] : [text('du '), subject(fact, formatted)]),
        text(` après l’arrêt : ${deltas(fact.payload['lines'])}`),
      ],
      ['subjectLabel', 'serviceDay', 'orderId', 'orderNumber', 'lines'],
    );
  },
  // « Marie D. a révisé la feuille de colisage de la commande ORD-7 du
  // 12 mars 2030 : +2 Baguette ».
  'packing_sheet.revised': (fact) => {
    const label = subjectLabelOf(fact);
    return byActor(
      fact,
      [
        text('a révisé la feuille de colisage '),
        ...(label === null
          ? [text('d’une commande')]
          : [text('de la commande '), subject(fact, label)]),
        text(' '),
        ...ofDay(fact),
        text(` : ${deltas(fact.payload['lines'])}`),
      ],
      ['subjectLabel', 'serviceDay', 'lines'],
    );
  },
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
