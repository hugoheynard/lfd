import { computed, signal } from '@angular/core';

import { normalizeTag } from './tag-palette';

/** Combien de suggestions au plus : au-delà, on tape une lettre de plus. */
export const SUGGESTION_LIMIT = 8;

/**
 * Les mots existants qui contiennent la saisie, hors ceux déjà portés.
 *
 * N'importe où dans le mot, comme la bande : « sant » trouve « croissant ».
 */
export function tagSuggestions(
  vocabulary: readonly string[],
  needle: string,
  worn: readonly string[],
): readonly string[] {
  if (needle === '') {
    return [];
  }
  const kept = new Set(worn);
  return vocabulary
    .filter((word) => word.includes(needle) && !kept.has(word))
    .slice(0, SUGGESTION_LIMIT);
}

/**
 * **Les mots-clés d'UNE image, en cours de saisie** — ceux qu'elle porte, ce
 * qu'on tape, et ce que le vocabulaire du fonds propose.
 *
 * Une classe et pas un service : elle vit le temps du panneau qui la crée,
 * et ne partage rien.
 */
export class TagEditor {
  readonly tags = signal<readonly string[]>([]);
  /** Ce qu'on tape dans le champ « Ajouter un mot-clé ». */
  readonly draft = signal('');
  /** Ce qui sera écrit — montré dès que la normalisation change la saisie. */
  readonly written = computed(() => normalizeTag(this.draft()));
  readonly suggestions = computed(() =>
    tagSuggestions(this.vocabulary(), this.written(), this.tags()),
  );

  constructor(private readonly vocabulary: () => readonly string[]) {}

  /** Ajoute la saisie (ou une suggestion), normalisée. Un mot déjà porté ne double pas. */
  add(raw: string): void {
    const tag = normalizeTag(raw);
    if (tag !== '' && !this.tags().includes(tag)) {
      this.tags.update((current) => [...current, tag]);
    }
    this.draft.set('');
  }

  remove(tag: string): void {
    this.tags.update((current) => current.filter((kept) => kept !== tag));
  }

  /** Repart des mots d'une image, saisie vidée. */
  reset(tags: readonly string[]): void {
    this.tags.set(tags);
    this.draft.set('');
  }
}
