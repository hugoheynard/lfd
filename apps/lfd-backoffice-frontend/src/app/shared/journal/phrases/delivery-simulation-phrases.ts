import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count } from '../payload-read';
import {
  byActor,
  cite,
  subject,
  subjectLabelOf,
  text,
  value,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **Les scénarios du simulateur** (`plan-preparation-de-tournee.md`, lot 9,
 * L9-C7) — le miroir de `DELIVERY_SIMULATION_FACTS` dans `@lfd/contracts`.
 * La charge ne porte que la taille de l'essai : on la dit.
 */

const SCENARIO: Noun = { the: 'le scénario', a: 'un scénario' };

function scenario(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text('un scénario de simulation')]
    : [text('le scénario « '), subject(fact, label), text(' »')];
}

/** « (6 arrêts, 2 véhicules) », ou rien sur une charge illisible. */
function sizeTerms(fact: PhraseFact): Segment[] {
  const stops = count(fact.payload['stops']);
  const vehicles = count(fact.payload['vehicles']);
  if (stops === null || vehicles === null) {
    return [];
  }
  const plural = (n: number, word: string): string => `${String(n)} ${word}${n > 1 ? 's' : ''}`;
  return [
    text(' ('),
    value(`${plural(stops, 'arrêt')}, ${plural(vehicles, 'véhicule')}`),
    text(')'),
  ];
}

export const DELIVERY_SIMULATION_PHRASES = {
  'delivery_simulation_scenario.created': (fact) =>
    byActor(
      fact,
      [text('a enregistré '), ...scenario(fact), ...sizeTerms(fact)],
      ['subjectLabel', 'stops', 'vehicles'],
    ),
  'delivery_simulation_scenario.replaced': (fact) => {
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
      ['subjectLabel', 'renamedFrom', 'stops', 'vehicles'],
    );
  },
  'delivery_simulation_scenario.duplicated': (fact) =>
    byActor(
      fact,
      [
        text('a créé '),
        ...scenario(fact),
        text(' en dupliquant '),
        ...cite(SCENARIO, fact.payload['source']),
      ],
      ['subjectLabel', 'source'],
    ),
  'delivery_simulation_scenario.archived': (fact) =>
    byActor(fact, [text('a archivé '), ...scenario(fact)], ['subjectLabel']),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
