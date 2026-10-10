import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  byActor,
  countOf,
  text,
  type Noun,
  type PhraseFact,
  type Phrase,
  type Said,
} from '../phrase';

import { theSubject } from './referential-support';

/**
 * **Remplacer une image du fonds** (L7, 2026-10-10) — un fait par geste, sur
 * l'image REMPLACÉE. L'URL de la nouvelle n'entre pas dans la phrase (un
 * hachage ne se lit pas) : elle reste au détail, où on la copie.
 */
const IMAGE: Noun = { the: 'l’image', a: 'une image' };

function mediaReplaced(fact: PhraseFact): Said {
  const count = countOf(fact.payload['carriers'], 'porteur', 'porteurs');
  const where =
    count === null
      ? []
      : fact.payload['carriers'] === 0
        ? [text(', que personne n’affichait')]
        : [text(' chez '), count];
  return byActor(
    fact,
    [text('a remplacé '), ...theSubject(fact, IMAGE), text(' par une autre image'), ...where],
    ['subjectLabel', 'carriers'],
  );
}

export const MEDIA_ASSET_REPLACE_PHRASES = {
  'media_asset.replaced': mediaReplaced,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
