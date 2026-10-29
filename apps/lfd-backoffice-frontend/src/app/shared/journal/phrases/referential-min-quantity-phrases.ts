import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { nameOf, recordOf } from '../payload-read';
import {
  byActor,
  fromTo,
  name,
  text,
  value,
  type Noun,
  type Phrase,
  type Segment,
} from '../phrase';

import { theSubject } from './referential-support';

/**
 * **La quantité minimale d'une déclinaison** (`product.min_quantities_changed`,
 * `documentation/catalogue/plan-quantite-minimale.md`, M1). Les deux minimums
 * sont dits dans la phrase, avant et après : ils tiennent en deux mots.
 */

const OF_PRODUCT: Noun = { the: 'de', a: 'd’une fiche' };
const AUDIENCE_WORDS: Readonly<Record<string, string>> = {
  pro: 'pros',
  public: 'particuliers',
};

/** « pros : 6, particuliers : 2 », « suit la déclinaison par défaut ». */
function minimumWords(raw: unknown): Segment[] {
  const state = recordOf(raw);
  if (state === null) {
    return [text('—')];
  }
  if (state['followsDefault'] === true) {
    return [text('suit la déclinaison par défaut')];
  }
  const cells = Object.entries(AUDIENCE_WORDS).flatMap(([audience, word]) => {
    const quantity = state[audience];
    return typeof quantity === 'number' ? [`${word} : ${String(quantity)}`] : [];
  });
  return [value(cells.length === 0 ? 'aucun minimum' : cells.join(', '))];
}

/**
 * « a passé la quantité minimale de la déclinaison « Boîte de 6 » de « Tarte
 * citron » de « aucun minimum » à « particuliers : 2 » ».
 */
const minQuantitiesChanged: Phrase = (fact) => {
  const p = fact.payload;
  const variant = nameOf(p['variant']);
  const change = recordOf(p['minQuantities']);
  return byActor(
    fact,
    [
      text('a passé la quantité minimale de '),
      ...(variant === null ? [text('une déclinaison')] : [text('la déclinaison '), name(variant)]),
      text(' '),
      ...theSubject(fact, OF_PRODUCT),
      ...(change === null
        ? []
        : [text(' '), ...fromTo(minimumWords(change['from']), minimumWords(change['to']))]),
    ],
    ['subjectLabel', 'variant', ...(change === null ? [] : ['minQuantities'])],
  );
};

export const REFERENTIAL_MIN_QUANTITY_PHRASES = {
  'product.min_quantities_changed': minQuantitiesChanged,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
