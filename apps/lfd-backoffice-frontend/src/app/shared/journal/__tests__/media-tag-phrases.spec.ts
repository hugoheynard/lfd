import { isJournalFactType, journalPayloadShapes } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les gestes sur un mot-clé du fonds** (L1, 2026-10-10) — un fait par
 * geste. Chaque charge est d'abord confrontée au catalogue.
 */
function tag(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'media_tag',
    subjectId: 'croissant',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  expect(isJournalFactType(input.type)).toBe(true);
  const shapes = isJournalFactType(input.type) ? journalPayloadShapes(input.type) : [];
  expect(shapes.some((shape) => shape.safeParse(input.payload).success)).toBe(true);
  return renderFact(input).sentence;
}

describe('les mots-clés de la médiathèque', () => {
  it('dit le renommage, le nouveau mot et le nombre d’images', () => {
    const fact = tag('media_tag.renamed', {
      subjectLabel: 'croissant',
      from: 'croissant',
      to: 'doré',
      images: 12,
      merged: false,
    });

    expect(sentence(fact)).toBe(
      'Colette Martin a renommé le mot-clé « croissant » en « doré » sur 12 images',
    );
    expect(renderFact(fact).detail).toEqual([]);
  });

  it('dit la fusion quand le nouveau mot existait déjà', () => {
    const fact = tag('media_tag.renamed', {
      subjectLabel: 'croissant',
      from: 'croissant',
      to: 'doré',
      images: 1,
      merged: true,
    });

    expect(sentence(fact)).toBe(
      'Colette Martin a renommé le mot-clé « croissant » en « doré » sur 1 image, fusionné avec le mot existant',
    );
  });

  it('dit le retrait et le nombre d’images', () => {
    const fact = tag('media_tag.removed', {
      subjectLabel: 'croissant',
      tag: 'croissant',
      images: 3,
    });

    expect(sentence(fact)).toBe('Colette Martin a retiré le mot-clé « croissant » de 3 images');
  });
});
