import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf, strings } from '../payload-read';
import {
  byActor,
  countOf,
  fromTo,
  text,
  valueIn,
  whatChanged,
  type Noun,
  type Phrase,
} from '../phrase';
import { OPERATION_AUDIENCE } from '../values/referential-values';

import { onSubject, onSubjectChanges, saidName, theSubject } from './referential-support';

/**
 * **Les opérations datées** — Noël, Pâques, la galette (famille
 * `referentialOperations` du catalogue des faits, lot 1 du plan
 * `documentation/order/architecture-operations-datees.md`, 2026-09-24).
 *
 * Écrites selon le guide en tête de `phrase-registry.ts`. Les dates ne se
 * récitent pas dans la phrase : elle nomme ce qui a bougé, le détail dit les
 * valeurs, en heure de Paris par leur unité (`instant`, `day`).
 */

const OPERATION: Noun = { the: 'l’opération', a: 'une opération' };
const OF_OPERATION: Noun = { the: 'de l’opération', a: 'd’une opération' };

/** « Colette Martin a préparé l'opération « Noël 2026 » ». Le détail dit les dates. */
const prepared: Phrase = (fact) =>
  byActor(
    fact,
    [text('a préparé '), ...theSubject(fact, OPERATION)],
    ['subjectLabel', ...saidName(fact.payload, 'name')],
  );

/** « … a redaté l'opération « Noël 2026 » : clôture des commandes ». */
const rescheduled: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a redaté '),
      ...theSubject(fact, OPERATION),
      ...whatChanged(fact.payload['changes'], fact.type),
    ],
    ['subjectLabel'],
  );

/** « … a passé la clientèle de l'opération « Noël 2026 » de « Professionnels » à « Particuliers » ». */
const audienceChanged: Phrase = (fact) => {
  const change = recordOf(fact.payload['audience']);
  const quoted = (raw: unknown) => [text('« '), valueIn(OPERATION_AUDIENCE, raw), text(' »')];
  return byActor(
    fact,
    [
      text('a passé la clientèle '),
      ...theSubject(fact, OF_OPERATION),
      ...(change === null
        ? []
        : [text(' '), ...fromTo(quoted(change['from']), quoted(change['to']))]),
    ],
    ['subjectLabel', ...(change === null ? [] : ['audience'])],
  );
};

/** « … a composé la sélection de l'opération « Noël 2026 » : 4 articles ». Le détail dit lesquels. */
const selectionSaved: Phrase = (fact) => {
  const after = recordOf(fact.payload['skus'])?.['to'];
  const size = after === undefined ? null : countOf(strings(after).length, 'article', 'articles');
  return byActor(
    fact,
    [
      text('a composé la sélection '),
      ...theSubject(fact, OF_OPERATION),
      ...(size === null ? [] : [text(' : '), size]),
    ],
    ['subjectLabel'],
  );
};

export const OPERATION_PHRASES = {
  'operation.prepared': prepared,
  'operation.edited': onSubjectChanges(OPERATION),
  'operation.rescheduled': rescheduled,
  'operation.audience_changed': audienceChanged,
  'operation.selection_saved': selectionSaved,
  'operation.archived': onSubject('a archivé', OPERATION),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
