import type { JournalFactType } from '@lfd/contracts/journal-facts';

import type { Noun, Phrase } from '../phrase';

import { onSubject, onSubjectChanges } from './referential-support';

/**
 * **Les formules** (`bundle.*`, famille `commerce`, plan
 * `documentation/formules/plan-les-formules.md`, F2a, 2026-10-19). La phrase
 * nomme le geste et la formule ; le détail dit les groupes et leurs choix.
 */

const BUNDLE: Noun = { the: 'la formule', a: 'une formule' };

export const BUNDLE_PHRASES = {
  'bundle.created': onSubject('a créé', BUNDLE),
  'bundle.presentation_edited': onSubjectChanges(BUNDLE),
  'bundle.composition_saved': onSubject('a recomposé', BUNDLE),
  'bundle.withdrawn': onSubject('a retiré', BUNDLE),
  'bundle.returned_to_draft': onSubject('a remis en brouillon', BUNDLE),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
