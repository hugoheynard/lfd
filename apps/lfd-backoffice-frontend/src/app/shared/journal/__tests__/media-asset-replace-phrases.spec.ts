import { isJournalFactType, journalPayloadShapes } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Remplacer une image du fonds** (L7, 2026-10-10). Chaque charge est
 * d'abord confrontée au catalogue.
 */
const NEW_IMAGE = 'https://media.example/products/b.jpg';

function replaced(carriers: number): FactInput {
  return {
    type: 'media_asset.replaced',
    payload: { subjectLabel: 'croissant', to: NEW_IMAGE, carriers },
    subjectType: 'media_asset',
    subjectId: 'https://media.example/products/a.jpg',
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

describe('le remplacement d’une image', () => {
  it('dit l’image remplacée et le nombre de porteurs', () => {
    expect(sentence(replaced(3))).toBe(
      'Colette Martin a remplacé l’image « croissant » par une autre image chez 3 porteurs',
    );
  });

  it('dit qu’aucun porteur ne l’affichait', () => {
    expect(sentence(replaced(0))).toBe(
      'Colette Martin a remplacé l’image « croissant » par une autre image, que personne n’affichait',
    );
  });

  it('garde l’URL de la nouvelle image au détail', () => {
    expect(JSON.stringify(renderFact(replaced(1)).detail)).toContain(NEW_IMAGE);
  });
});
