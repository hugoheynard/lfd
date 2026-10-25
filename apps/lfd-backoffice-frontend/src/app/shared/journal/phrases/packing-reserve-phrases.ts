import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, entries, optional } from '../payload-read';
import { byActor, cite, subject, subjectLabelOf, text, type Phrase } from '../phrase';
import { formatUnit } from '../units';

/**
 * **Une sortie de réserve vers une boutique** (plan A1, lot A1.4) — le miroir
 * de `PACKING_RESERVE_FACTS` dans `@lfd/contracts`. Ce sont elles qui
 * expliquent, au journal, une réserve qui baisse sans bac ni retour au
 * fournil.
 */

/** « 3 pièces », la somme des lignes ; `null` si la charge n'en dit rien. */
function piecesOf(lines: unknown): string | null {
  const total = entries(lines).reduce((sum, line) => sum + (count(line['quantity']) ?? 0), 0);
  return total === 0 ? null : `${String(total)} ${total > 1 ? 'pièces' : 'pièce'}`;
}

export const PACKING_RESERVE_PHRASES = {
  // « Marie D. a envoyé en boutique 3 pièces de la réserve du 12 mars 2030,
  // vers le point « Village » » — le détail des articles reste au détail.
  'packing_stock.sent_to_shop': (fact) => {
    const day = optional(fact.payload['serviceDay']) ?? subjectLabelOf(fact);
    const formatted = day === null ? null : formatUnit('day', day);
    const pieces = piecesOf(fact.payload['lines']);
    return byActor(
      fact,
      [
        text(`a envoyé en boutique ${pieces ?? 'des pièces'} de la réserve `),
        ...(formatted === null ? [text('d’une journée')] : [text('du '), subject(fact, formatted)]),
        text(', vers '),
        ...cite({ the: 'le point', a: 'un point' }, fact.payload['site']),
      ],
      ['subjectLabel', 'serviceDay', 'site'],
    );
  },
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
