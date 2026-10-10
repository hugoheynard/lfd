import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional } from '../payload-read';
import {
  byActor,
  countOf,
  name,
  text,
  type Noun,
  type PhraseFact,
  type Phrase,
  type Said,
  type Segment,
} from '../phrase';

import { theSubject } from './referential-support';

/**
 * **Les mots-clés de la médiathèque** — un geste sur tout le fonds (L1,
 * 2026-10-10). Un fait par geste, pas un par image : la phrase dit qui a
 * renommé ou retiré le mot, et sur combien d'images.
 */
const TAG: Noun = { the: 'le mot-clé', a: 'un mot-clé' };

/** « sur 12 images » — rien si la charge n'a pas figé de compte. */
function onImages(raw: unknown): Segment[] {
  const count = countOf(raw, 'image', 'images');
  return count === null ? [] : [text(' sur '), count];
}

function tagRenamed(fact: PhraseFact): Said {
  const to = optional(fact.payload['to']);
  const merged = fact.payload['merged'] === true;
  return byActor(
    fact,
    [
      text('a renommé '),
      ...theSubject(fact, TAG),
      ...(to === null ? [] : [text(' en « '), name(to), text(' »')]),
      ...onImages(fact.payload['images']),
      ...(merged ? [text(', fusionné avec le mot existant')] : []),
    ],
    ['subjectLabel', 'from', 'to', 'images', 'merged'],
  );
}

function tagRemoved(fact: PhraseFact): Said {
  const count = countOf(fact.payload['images'], 'image', 'images');
  return byActor(
    fact,
    [
      text('a retiré '),
      ...theSubject(fact, TAG),
      ...(count === null ? [text(' de la médiathèque')] : [text(' de '), count]),
    ],
    ['subjectLabel', 'tag', 'images'],
  );
}

export const MEDIA_TAG_PHRASES = {
  'media_tag.renamed': tagRenamed,
  'media_tag.removed': tagRemoved,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
