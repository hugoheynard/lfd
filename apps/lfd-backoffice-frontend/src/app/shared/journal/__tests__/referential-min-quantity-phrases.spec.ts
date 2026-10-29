import { isJournalFactType, journalPayloadShapes } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput, type RenderedFact } from '../render-fact';

/**
 * **La quantité minimale d'une déclinaison** (`product.min_quantities_changed`,
 * `plan-quantite-minimale.md`, M1) : la grille dite en entier, avant et après.
 */

function on(payload: Record<string, unknown>): FactInput {
  return {
    type: 'product.min_quantities_changed',
    payload,
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

const NONE = { followsDefault: false, pro: {}, public: {} };

describe('la quantité minimale d’une déclinaison', () => {
  it('dit la grille posée, chaque case sous le nom figé de son contexte', () => {
    const fact = on({
      subjectLabel: 'Tarte citron',
      variant: { id: 'var_2', name: 'Boîte de 6' },
      minQuantities: { from: NONE, to: { followsDefault: false, pro: { b2b: 6 }, public: {} } },
      contextLabels: { b2b: 'B2B' },
    });

    expect(render(fact).sentence).toBe(
      'Colette Martin a passé la quantité minimale de la déclinaison Boîte de 6 de « Tarte citron » de aucun minimum à pros b2b : 6',
    );
    expect(render(fact).detail).toEqual([]);
  });

  it('dit « suit la déclinaison par défaut »', () => {
    const fact = on({
      subjectLabel: 'Tarte citron',
      variant: { id: 'var_2', name: 'Boîte de 6' },
      minQuantities: { from: NONE, to: { ...NONE, followsDefault: true } },
      contextLabels: {},
    });

    expect(render(fact).sentence).toContain('à suit la déclinaison par défaut');
  });
});
