import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import { byActor, fromTo, text, valueIn, type Noun, type Phrase } from '../phrase';
import { SUGGESTION_ORDER } from '../values/commerce-values';

import { onSubject, onSubjectChanges } from './referential-support';

/**
 * **Les suggestions décidées par le staff** (`staff_suggestion.*`, famille
 * `commerce`, plan `documentation/recommandation-produit/plan-suggestions-du-staff.md`,
 * RS1, 2026-10-18). La phrase nomme le geste et la suggestion ; le détail dit
 * le déclencheur, les articles, l'emplacement, la période.
 */

const SUGGESTION: Noun = { the: 'la suggestion', a: 'une suggestion' };

/** « … a réglé l'ordre des suggestions de « La plus récente d'abord » à « Par priorité » ». */
const orderChanged: Phrase = (fact) => {
  const change = recordOf(fact.payload['order']);
  const quoted = (raw: unknown) => [text('« '), valueIn(SUGGESTION_ORDER, raw), text(' »')];
  return byActor(
    fact,
    [
      text('a réglé l’ordre des suggestions'),
      ...(change === null
        ? []
        : [text(' '), ...fromTo(quoted(change['from']), quoted(change['to']))]),
    ],
    change === null ? [] : ['order'],
  );
};

export const SUGGESTION_PHRASES = {
  'staff_suggestion.created': onSubject('a créé', SUGGESTION),
  'staff_suggestion.revised': onSubjectChanges(SUGGESTION),
  'staff_suggestion.activated': onSubject('a rallumé', SUGGESTION),
  'staff_suggestion.deactivated': onSubject('a coupé', SUGGESTION),
  'staff_suggestion.archived': onSubject('a archivé', SUGGESTION),
  'staff_suggestion_order.changed': orderChanged,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
