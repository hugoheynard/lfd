import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count } from '../payload-read';
import {
  byActor,
  subject,
  subjectLabelOf,
  text,
  value,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **Les scénarios d'achat** (`plan-bibliotheque-d-achat.md`, B-D5, lot B3) —
 * le miroir des faits `delivery_purchase_scenario.*` dans `@lfd/contracts`.
 * La charge ne porte que la taille de la sélection : on la dit.
 */

function scenario(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text('un scénario d’achat')]
    : [text('le scénario d’achat « '), subject(fact, label), text(' »')];
}

/** « (2 véhicules, 3 formats) », ou rien sur une charge illisible. */
function sizeTerms(fact: PhraseFact): Segment[] {
  const vehicles = count(fact.payload['vehicles']);
  const formats = count(fact.payload['formats']);
  if (vehicles === null || formats === null) {
    return [];
  }
  const plural = (n: number, word: string): string => `${String(n)} ${word}${n > 1 ? 's' : ''}`;
  return [
    text(' ('),
    value(`${plural(vehicles, 'véhicule')}, ${plural(formats, 'format')}`),
    text(')'),
  ];
}

export const DELIVERY_PURCHASE_SCENARIO_PHRASES = {
  'delivery_purchase_scenario.created': (fact) =>
    byActor(
      fact,
      [text('a enregistré '), ...scenario(fact), ...sizeTerms(fact)],
      ['subjectLabel', 'vehicles', 'formats'],
    ),
  'delivery_purchase_scenario.replaced': (fact) => {
    const renamedFrom = fact.payload['renamedFrom'];
    return byActor(
      fact,
      [
        text('a remplacé '),
        ...scenario(fact),
        ...sizeTerms(fact),
        ...(typeof renamedFrom === 'string'
          ? [text(', autrefois « '), value(renamedFrom), text(' »')]
          : []),
      ],
      ['subjectLabel', 'renamedFrom', 'vehicles', 'formats'],
    );
  },
  'delivery_purchase_scenario.archived': (fact) =>
    byActor(fact, [text('a archivé '), ...scenario(fact)], ['subjectLabel']),
  'delivery_purchase_scenario.reactivated': (fact) =>
    byActor(fact, [text('a réactivé '), ...scenario(fact)], ['subjectLabel']),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
