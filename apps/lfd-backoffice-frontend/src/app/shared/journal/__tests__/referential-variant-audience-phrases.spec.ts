import { isJournalFactType, journalPayloadShapes } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput, type RenderedFact } from '../render-fact';

/**
 * **L'audience d'une déclinaison** (`product.variant_audience_changed`,
 * `plan-audience-par-declinaison.md`, A8) : `null` dit qu'elle suit sa fiche.
 */

function on(from: string | null, to: string | null): FactInput {
  return {
    type: 'product.variant_audience_changed',
    payload: {
      subjectLabel: 'Tarte citron',
      variant: { id: 'var_2', name: 'Boîte de 6' },
      audience: { from, to },
    },
    subjectType: 'product',
    subjectId: 'product_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function render(input: FactInput): RenderedFact {
  const type = input.type;
  expect(isJournalFactType(type)).toBe(true);
  const shapes = isJournalFactType(type) ? journalPayloadShapes(type) : [];
  expect(shapes.some((shape) => shape.safeParse(input.payload).success)).toBe(true);
  return renderFact(input);
}

describe('l’audience d’une déclinaison', () => {
  it('dit la clientèle posée sur une déclinaison qui suivait sa fiche', () => {
    const sentence = render(on(null, 'pro')).sentence;
    expect(sentence).toContain('Colette Martin a passé la clientèle de la fiche « Tarte citron »');
    expect(sentence).toContain('Boîte de 6');
    expect(sentence).toContain('de celle de sa fiche à « Professionnels »');
  });

  it('dit le retour à l’audience de la fiche', () => {
    expect(render(on('both', null)).sentence).toContain(
      'de « Professionnels et particuliers » à celle de sa fiche',
    );
  });

  it('nomme le réassort des boutiques, au lieu de la valeur brute', () => {
    expect(render(on(null, 'resupply')).sentence).toContain(
      'à « Réassort des boutiques seulement »',
    );
  });
});
