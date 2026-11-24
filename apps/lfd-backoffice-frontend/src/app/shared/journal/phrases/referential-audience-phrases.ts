import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import {
  byActor,
  cite,
  fromTo,
  text,
  valueIn,
  type Noun,
  type Phrase,
  type Segment,
} from '../phrase';
import { CATALOGUE_AUDIENCE } from '../values/referential-values';

import { theSubject } from './referential-support';

/**
 * **L'audience du catalogue** — à qui une famille ou une fiche vend (lot 1 de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`). Les mots
 * sont ceux des opérations : une même liste de clientèles.
 */

const OF_PRODUCT: Noun = { the: 'de la fiche', a: 'd’une fiche' };
const OF_CATEGORY: Noun = { the: 'de la famille', a: 'd’une famille' };

/**
 * « « Professionnels » » ; `null` : la fiche suit sa famille, la déclinaison
 * suit sa fiche (`plan-audience-par-declinaison.md`, A1).
 */
function quoted(raw: unknown, inherited = 'celle de sa famille'): Segment[] {
  if (raw === null) {
    return [text(inherited)];
  }
  return [text('« '), valueIn(CATALOGUE_AUDIENCE, raw), text(' »')];
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

/**
 * « … a passé la clientèle de la fiche « Tarte », déclinaison « Boîte de 6 » de
 * celle de sa fiche à « Professionnels » » — le défaut n'en porte jamais.
 */
const variantAudienceChanged: Phrase = (fact) => {
  const change = recordOf(fact.payload['audience']);
  const variant = fact.payload['variant'];
  return byActor(
    fact,
    [
      text('a passé la clientèle '),
      ...theSubject(fact, OF_PRODUCT),
      ...(variant === undefined
        ? []
        : cite({ the: ', déclinaison', a: ', une déclinaison' }, variant)),
      ...(change === null
        ? []
        : [
            text(' '),
            ...fromTo(
              quoted(change['from'], 'celle de sa fiche'),
              quoted(change['to'], 'celle de sa fiche'),
            ),
          ]),
    ],
    ['subjectLabel', 'variant', ...(change === null ? [] : ['audience'])],
  );
};

export const REFERENTIAL_AUDIENCE_PHRASES = {
  'product.variant_audience_changed': variantAudienceChanged,
  'product.audience_changed': audienceChanged(OF_PRODUCT),
  'product_category.audience_changed': audienceChanged(OF_CATEGORY),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
