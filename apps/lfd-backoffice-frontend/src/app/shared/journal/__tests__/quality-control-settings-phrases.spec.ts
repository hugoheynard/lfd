import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Où le contrôle qualité se rend** (`production_quality_settings.updated`, 2026-10-26). */

function updated(payload: Readonly<Record<string, unknown>>): FactInput {
  return {
    type: 'production_quality_settings.updated',
    payload,
    subjectType: 'production_quality_settings',
    subjectId: 'quality',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

const sentence = (input: FactInput): string => renderFact(input).sentence.replace(/\s/gu, ' ');

describe('le contrôle qualité (production_quality_settings.updated)', () => {
  it('dit l’activation au fournil, sans détail résiduel', () => {
    const input = updated({
      lineChecks: true,
      orderChecks: true,
      previous: { lineChecks: false, orderChecks: true },
    });

    expect(sentence(input)).toBe('Colette Martin a activé le contrôle qualité au fournil');
    expect(renderFact(input).detail).toEqual([]);
  });

  it('dit les deux bascules ensemble', () => {
    expect(
      sentence(
        updated({
          lineChecks: true,
          orderChecks: false,
          previous: { lineChecks: false, orderChecks: true },
        }),
      ),
    ).toBe(
      'Colette Martin a activé le contrôle qualité au fournil et a désactivé le contrôle qualité au colisage',
    );
  });

  it('une charge illisible garde une phrase neutre', () => {
    expect(sentence(updated({}))).toBe('Colette Martin a réglé le contrôle qualité');
  });
});
