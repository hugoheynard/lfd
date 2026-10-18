import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les suggestions décidées** (`staff_suggestion.*`, RS1, 2026-10-18). */

function fact(type: FactInput['type'], payload: Readonly<Record<string, unknown>>): FactInput {
  return {
    type,
    payload,
    subjectType: 'staff_suggestion',
    subjectId: '01JRULE',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

const sentence = (input: FactInput): string => renderFact(input).sentence.replace(/\s/gu, ' ');

describe('les suggestions décidées au journal', () => {
  it('dit la création, et laisse au détail le déclencheur et l’emplacement', () => {
    const input = fact('staff_suggestion.created', {
      subjectLabel: 'Avec un croissant, le café',
      trigger: 'product_in_cart',
      triggerRef: 'VIE-001',
      skus: ['BOI-001'],
      placement: 'cart',
      audience: 'both',
      startsOn: '2026-10-18',
      endsOn: '2026-10-25',
      phrase: { fr: 'Avec un croissant, le café' },
      priority: 0,
    });
    expect(sentence(input)).toBe(
      'Colette Martin a créé la suggestion « Avec un croissant, le café »',
    );
    const detail = JSON.stringify(renderFact(input).detail);
    expect(detail).toContain('Article au panier');
    expect(detail).toContain('Panier');
  });

  it('dit la coupure et le réglage de l’ordre', () => {
    expect(sentence(fact('staff_suggestion.deactivated', { subjectLabel: 'Le café' }))).toBe(
      'Colette Martin a coupé la suggestion « Le café »',
    );
    expect(
      sentence(
        fact('staff_suggestion_order.changed', { order: { from: 'recent', to: 'priority' } }),
      ),
    ).toBe(
      'Colette Martin a réglé l’ordre des suggestions de « La plus récente d’abord » à « Par priorité »',
    );
  });
});
