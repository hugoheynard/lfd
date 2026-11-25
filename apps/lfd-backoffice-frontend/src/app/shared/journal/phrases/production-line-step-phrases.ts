import type { JournalFactType } from '@lfd/contracts/journal-facts';

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

/**
 * **Les étapes d'une ligne du fournil** — le miroir de `production_line.*`
 * dans `@lfd/contracts` (`documentation/fournil/un-produit-sur-plusieurs-postes.md`,
 * § 2.3). Le sujet est le produit de la ligne ; la phrase nomme le poste
 * dont c'est l'étape, parce qu'un produit en a plusieurs.
 */
function product(fact: PhraseFact): Segment {
  return subject(fact, subjectLabelOf(fact) ?? 'un produit');
}

/** « (Boulangerie) » — le poste du geste, ou rien s'il manque. */
function station(fact: PhraseFact): Segment[] {
  const called = fact.payload['workstationName'];
  return typeof called === 'string' ? [text(' au poste '), name(called)] : [];
}

const KEYS = ['subjectLabel', 'serviceDay', 'sku', 'workstationId', 'workstationName', 'version'];

const stepDone: Phrase = (fact) =>
  byActor(fact, [text('a fait l’étape de '), product(fact), ...station(fact)], KEYS);

const stepRed: Phrase = (fact) => {
  const reason = fact.payload['reason'];
  return byActor(
    fact,
    [
      text('a mis en rouge l’étape de '),
      product(fact),
      ...station(fact),
      ...(typeof reason === 'string' ? [text(' — '), name(reason)] : []),
    ],
    [...KEYS, 'reason'],
  );
};

const stepUndone: Phrase = (fact) =>
  byActor(fact, [text('a décoché l’étape de '), product(fact), ...station(fact)], KEYS);

export const PRODUCTION_LINE_STEP_PHRASES = {
  'production_line.step_done': stepDone,
  'production_line.step_red': stepRed,
  'production_line.step_undone': stepUndone,
} satisfies Partial<Record<JournalFactType, Phrase>>;
