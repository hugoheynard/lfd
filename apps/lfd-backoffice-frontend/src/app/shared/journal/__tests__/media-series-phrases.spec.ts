import { isJournalFactType, journalPayloadShapes } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les séries de la médiathèque** (L3, 2026-10-10). Chaque charge est
 * d'abord confrontée au catalogue.
 */
function series(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'media_series',
    subjectId: 'series_1',
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

describe('les séries de la médiathèque', () => {
  it('dit l’ouverture d’une série par son titre', () => {
    const fact = series('media_series.created', {
      subjectLabel: 'Été',
      title: 'Été',
      shotOn: null,
      note: null,
    });

    expect(sentence(fact)).toBe('Colette Martin a ouvert la série « Été »');
  });

  it('dit ce qu’une correction a changé', () => {
    const fact = series('media_series.described', {
      subjectLabel: 'Été',
      changes: { title: { from: 'Printemps', to: 'Été' }, note: { from: null, to: 'four' } },
    });

    expect(sentence(fact)).toBe('Colette Martin a modifié la série « Été » : titre, note');
  });

  it('le rattachement d’une image à une série se lit dans sa description', () => {
    const fact: FactInput = {
      type: 'media_asset.described',
      payload: {
        subjectLabel: 'Croissant',
        changes: { series: { from: null, to: { id: 'series_1', name: 'Été' } } },
      },
      subjectType: 'media_asset',
      subjectId: 'https://media.example/products/abc.png',
      actorName: 'Colette Martin',
      actorType: 'staff',
    };

    expect(sentence(fact)).toBe('Colette Martin a décrit l’image « Croissant » : série');
  });
});
