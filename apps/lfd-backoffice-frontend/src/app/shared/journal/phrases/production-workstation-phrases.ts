import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import {
  byActor,
  citedName,
  countOf,
  name,
  subject,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
} from '../phrase';

/**
 * **Les postes du fournil** — le miroir de `production_workstation.*` dans
 * `@lfd/contracts` (plan `fournil/plan-postes-du-fournil.md`, § 3.3, W1). Le
 * sujet est le poste et son nom du moment ; l'ordre des fiches et le retour
 * « à ranger » visent la carte entière.
 */
function station(fact: PhraseFact): ReturnType<typeof subject> {
  return subject(fact, subjectLabelOf(fact) ?? 'un poste');
}

/** « Boulangerie, Tourier, Pâtisserie » — les noms dans l'ordre, ou rien. */
function orderOf(raw: unknown): string {
  const names = Array.isArray(raw)
    ? raw.flatMap((cited) => {
        const called = citedName(cited);
        return called === null ? [] : [called];
      })
    : [];
  return names.join(', ');
}

const declared: Phrase = (fact) =>
  byActor(
    fact,
    [text('a ajouté le poste du fournil '), station(fact)],
    ['subjectLabel', 'position'],
  );

const renamed: Phrase = (fact) => {
  const before = recordOf(fact.payload['previous'])?.['name'];
  return byActor(
    fact,
    [
      text('a renommé le poste du fournil '),
      station(fact),
      ...(typeof before === 'string' ? [text(' ; il s’appelait '), name(before)] : []),
    ],
    ['subjectLabel', 'previous'],
  );
};

const reordered: Phrase = (fact) => {
  const order = orderOf(fact.payload['order']);
  return byActor(
    fact,
    [
      text('a réordonné les postes du fournil'),
      ...(order === '' ? [] : [text(' : '), name(order)]),
    ],
    ['subjectLabel', 'order'],
  );
};

const archived: Phrase = (fact) =>
  byActor(fact, [text('a archivé le poste du fournil '), station(fact)], ['subjectLabel']);

const productsPlaced: Phrase = (fact) => {
  const placed = countOf(fact.payload['count'], 'produit', 'produits');
  const target = citedName(fact.payload['workstation']);
  return byActor(
    fact,
    [
      text('a placé '),
      placed ?? text('des produits'),
      ...(target === null ? [text(' « à ranger »')] : [text(' au poste '), subject(fact, target)]),
    ],
    ['subjectLabel', 'workstation', 'skus', 'count'],
  );
};

export const PRODUCTION_WORKSTATION_PHRASES = {
  'production_workstation.declared': declared,
  'production_workstation.renamed': renamed,
  'production_workstation.reordered': reordered,
  'production_workstation.archived': archived,
  'production_workstation.products_placed': productsPlaced,
} satisfies Partial<Record<JournalFactType, Phrase>>;
