import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { contextWord } from '../context-word';
import { nameOf, recordOf, type Payload } from '../payload-read';
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
 * `documentation/catalogue/plan-quantite-minimale.md`, M1). La grille entière
 * est dite dans la phrase, avant et après : elle tient en quelques cases, et
 * un détail clé par clé la rendrait illisible.
 */

const OF_PRODUCT: Noun = { the: 'de', a: 'd’une fiche' };
const AUDIENCE_WORDS: Readonly<Record<string, string>> = {
  pro: 'pros',
  public: 'particuliers',
};

/** « pros à emporter : 6, particuliers à emporter : 2 », « suit la déclinaison par défaut ». */
function gridWords(payload: Payload, raw: unknown): Segment[] {
  const state = recordOf(raw);
  if (state === null) {
    return [text('—')];
  }
  if (state['followsDefault'] === true) {
    return [text('suit la déclinaison par défaut')];
  }
  const cells = Object.entries(AUDIENCE_WORDS).flatMap(([audience, word]) =>
    Object.entries(recordOf(state[audience]) ?? {}).map(
      ([key, quantity]) =>
        `${word} ${contextWord(payload, key)?.toLowerCase() ?? key} : ${String(quantity)}`,
    ),
  );
  return [value(cells.length === 0 ? 'aucun minimum' : cells.join(', '))];
}

/**
 * « a passé la quantité minimale de la déclinaison « Boîte de 6 » de « Tarte
 * citron » de « aucun minimum » à « particuliers à emporter : 2 » ».
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
        : [text(' '), ...fromTo(gridWords(p, change['from']), gridWords(p, change['to']))]),
    ],
    ['subjectLabel', 'variant', 'contextLabels', ...(change === null ? [] : ['minQuantities'])],
  );
};

export const REFERENTIAL_MIN_QUANTITY_PHRASES = {
  'product.min_quantities_changed': minQuantitiesChanged,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
