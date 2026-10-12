import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les phrases des dates des modes et du mode d'un payeur** (lot M1, plan
 * `plan-rythme-de-facturation.md`, §16.6-7). Les instants ne sont comparés à
 * aucune horloge : ils sont dits.
 */
const NOV_1 = '2026-10-31T23:00:00.000Z';

function fact(type: string, subjectType: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType,
    subjectId: subjectType === 'company' ? 'co_1' : 'le_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

describe('les dates d’un mode', () => {
  const base = { subjectLabel: 'La Folie Douce SAS', mode: 'weekly', effectiveAt: NOV_1 };

  it('dit le programmé, sa prise d’effet et ce qu’il remplace, sans détail en reste', () => {
    const rendered = renderFact(
      fact('legal_entity.billing_mode_dates_changed', 'legal_entity', {
        ...base,
        from: [1],
        to: [3],
        cancelled: false,
      }),
    );

    expect(rendered.sentence).toContain('a programmé les dates du mode');
    expect(rendered.sentence).toContain('chaque semaine le mercredi');
    expect(rendered.sentence).toContain('(au lieu de chaque semaine le lundi)');
    expect(rendered.detail).toEqual([]);
  });

  it('dit l’annulation, et ce qui reste en vigueur', () => {
    const { sentence } = renderFact(
      fact('legal_entity.billing_mode_dates_changed', 'legal_entity', {
        ...base,
        from: [3],
        to: [1],
        cancelled: true,
      }),
    );

    expect(sentence).toContain('a annulé le changement programmé');
    expect(sentence).toContain('restent chaque semaine le lundi');
  });
});

describe('le mode d’un payeur', () => {
  const base = {
    subjectLabel: 'Le Bistrot',
    legalEntity: { id: 'le_1', name: 'La Folie Douce SAS' },
    effectiveAt: NOV_1,
  };

  it('dit le passage programmé, lié à la fiche du client, chez l’entité nommée', () => {
    const rendered = renderFact(
      fact('payer.billing_mode_changed', 'company', {
        ...base,
        from: 'monthly',
        to: 'weekly',
        cancelled: false,
      }),
    );

    expect(rendered.sentence).toContain('a programmé le mode de facturation de « Le Bistrot »');
    expect(rendered.sentence).toContain('« La Folie Douce SAS »');
    expect(rendered.segments).toContainEqual({
      kind: 'subject',
      text: 'Le Bistrot',
      route: '/comptes-clients/co_1',
    });
    expect(rendered.detail).toEqual([]);
  });

  it('dit l’annulation, et le mode qui reste', () => {
    const { sentence } = renderFact(
      fact('payer.billing_mode_changed', 'company', {
        ...base,
        from: 'weekly',
        to: 'monthly',
        cancelled: true,
      }),
    );

    expect(sentence).toContain('a annulé le passage de « Le Bistrot » au mode');
    expect(sentence).toContain('il reste au mode');
  });
});
