import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les phrases des bacs** (lot 4 bis v2, tranche A). */

function fact(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'delivery_bin_type',
    subjectId: 'bin_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

const BAC_M = {
  name: 'Bac M',
  outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
  isotherm: false,
  maxStack: 5,
  divisible: true,
};

describe('les bacs (delivery_bin_type.*, delivery_bin_capacity.set)', () => {
  it('dit un type ajouté en entier', () => {
    expect(sentence(fact('delivery_bin_type.added', { subjectLabel: 'Bac M', bin: BAC_M }))).toBe(
      'Colette Martin a ajouté le type de bac « Bac M » (extérieur 60 × 40 × 30 cm, intérieur 56 × 36 × 27 cm, sec, pile de 5 au plus, cloisonnable)',
    );
  });

  it('dit une fiche tracée en mm (depuis le 2026-10-07) en centimètres à la virgule', () => {
    const manne = {
      ...BAC_M,
      name: 'Manne à pain',
      outer: { lengthMm: 665, widthMm: 460, heightMm: 715 },
      inner: { lengthMm: 645, widthMm: 440, heightMm: 695 },
      maxStack: 1,
      divisible: false,
    };
    expect(
      sentence(fact('delivery_bin_type.added', { subjectLabel: 'Manne à pain', bin: manne })),
    ).toBe(
      'Colette Martin a ajouté le type de bac « Manne à pain » (extérieur 66,5 × 46 × 71,5 cm, intérieur 64,5 × 44 × 69,5 cm, sec, pile de 1 au plus, sans cloison)',
    );
  });

  it('ne dit d’une correction que ce qui a changé', () => {
    expect(
      sentence(
        fact('delivery_bin_type.corrected', {
          subjectLabel: 'Bac M',
          before: BAC_M,
          after: { ...BAC_M, isotherm: true, maxStack: 4 },
        }),
      ),
    ).toBe(
      'Colette Martin a corrigé le type de bac « Bac M » : de sec à isotherme ; de pile de 5 au plus à pile de 4 au plus',
    );
  });

  it('dit l’archivage et la réactivation', () => {
    expect(
      sentence(fact('delivery_bin_type.archived', { subjectLabel: 'Bac M', bin: BAC_M })),
    ).toContain('Colette Martin a archivé le type de bac « Bac M »');
    expect(
      sentence(fact('delivery_bin_type.reactivated', { subjectLabel: 'Bac M', bin: BAC_M })),
    ).toContain('Colette Martin a réactivé le type de bac « Bac M »');
  });

  it('dit une contenance fixée, d’aucune à un nombre', () => {
    expect(
      sentence(
        fact('delivery_bin_capacity.set', {
          subjectLabel: 'Bac M',
          sku: 'CRO-01',
          before: null,
          after: 24,
        }),
      ),
    ).toBe(
      'Colette Martin a fixé la contenance de CRO-01 dans le type de bac « Bac M » de aucune à 24 unités par bac entier',
    );
  });

  it('dit une contenance retirée, et ce qu’elle était', () => {
    expect(
      sentence(
        fact('delivery_bin_capacity.set', {
          subjectLabel: 'Bac M',
          sku: 'CRO-01',
          before: 24,
          after: null,
        }),
      ),
    ).toBe(
      'Colette Martin a retiré la contenance de CRO-01 dans le type de bac « Bac M » (c’était 24 unités)',
    );
  });
});
