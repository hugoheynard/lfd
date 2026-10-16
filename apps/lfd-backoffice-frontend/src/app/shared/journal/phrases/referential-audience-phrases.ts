import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import { byActor, fromTo, text, valueIn, type Noun, type Phrase, type Segment } from '../phrase';
import { OPERATION_AUDIENCE } from '../values/referential-values';

import { theSubject } from './referential-support';

/**
 * **L'audience du catalogue** — à qui une famille ou une fiche vend (lot 1 de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`). Les mots
 * sont ceux des opérations : une même liste de clientèles.
 */

const OF_PRODUCT: Noun = { the: 'de la fiche', a: 'd’une fiche' };
const OF_CATEGORY: Noun = { the: 'de la famille', a: 'd’une famille' };

/** « « Professionnels » » ; `null` sur une fiche : elle suit sa famille. */
function quoted(raw: unknown): Segment[] {
  if (raw === null) {
    return [text('celle de sa famille')];
  }
  return [text('« '), valueIn(OPERATION_AUDIENCE, raw), text(' »')];
}

/** « … a passé la clientèle de la fiche « Tarte » de « Professionnels » à celle de sa famille ». */
function audienceChanged(noun: Noun): Phrase {
  return (fact) => {
    const change = recordOf(fact.payload['audience']);
    return byActor(
      fact,
      [
        text('a passé la clientèle '),
        ...theSubject(fact, noun),
        ...(change === null
          ? []
          : [text(' '), ...fromTo(quoted(change['from']), quoted(change['to']))]),
      ],
      ['subjectLabel', ...(change === null ? [] : ['audience'])],
    );
  };
}

export const REFERENTIAL_AUDIENCE_PHRASES = {
  'product.audience_changed': audienceChanged(OF_PRODUCT),
  'product_category.audience_changed': audienceChanged(OF_CATEGORY),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
