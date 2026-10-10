import type { JournalFactType } from '@lfd/contracts/journal-facts';

import type { Noun, Phrase } from '../phrase';

import { onSubject, onSubjectChanges } from './referential-support';

/**
 * **Les séries de la médiathèque** (L3, 2026-10-10). Le rattachement d'une
 * image à une série n'est pas ici : c'est l'image qui change, et il se lit
 * dans `media_asset.described`.
 */
const SERIES: Noun = { the: 'la série', a: 'une série' };

export const MEDIA_SERIES_PHRASES = {
  // « Colette Martin a ouvert la série « Été » » — titre, jour et note au détail.
  'media_series.created': onSubject('a ouvert', SERIES),
  'media_series.described': onSubjectChanges(SERIES),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
