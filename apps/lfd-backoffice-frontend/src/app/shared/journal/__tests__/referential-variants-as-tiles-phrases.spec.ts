import { isJournalFactType, journalPayloadShapes } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput, type RenderedFact } from '../render-fact';

/**
 * **Chaque déclinaison en vignette** (`product.variants_as_tiles_changed`,
 * `plan-declinaisons-en-vignette.md`, V1) : les deux sens de la case.
 */

function on(to: boolean): FactInput {
  return {
    type: 'product.variants_as_tiles_changed',
    payload: { subjectLabel: 'Florentin', from: !to, to },
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

describe('les vignettes de déclinaison', () => {
  it('dit que chaque déclinaison paraît en vignette', () => {
    expect(render(on(true)).sentence).toBe(
      'Colette Martin a montré chaque déclinaison de la fiche « Florentin » en vignette',
    );
  });

  it('dit que seule la déclinaison par défaut paraît', () => {
    expect(render(on(false)).sentence).toBe(
      "Colette Martin n'a plus montré que la déclinaison par défaut de la fiche « Florentin »",
    );
  });
});
