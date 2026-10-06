import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les phrases de la bibliothèque d'achat** (`plan-bibliotheque-d-achat.md`, lot B1). */

function fact(type: string, subjectType: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType,
    subjectId: 'cand_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

const KANGOO = {
  name: 'Kangoo L2',
  cargo: { lengthCm: 220, widthCm: 150, heightCm: 125 },
  wheelArches: { lengthCm: 80, protrusionCm: 20, fromBackCm: 30, heightCm: 25 },
  reference: 'KL2-2026',
  purchaseUrl: 'https://exemple.fr/kangoo',
  priceCentsExclVat: 2_500_000,
};

const CAISSE = {
  name: 'Caisse Dupont 50',
  outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
  isotherm: false,
  maxStack: 5,
  supplier: 'Dupont',
  reference: null,
  purchaseUrl: null,
  unitPriceCentsExclVat: null,
};

describe('la bibliothèque d’achat (delivery_purchase_*_candidate.*)', () => {
  it('dit un véhicule candidat ajouté en entier, prix HT compris', () => {
    const said = sentence(
      fact('delivery_purchase_vehicle_candidate.declared', 'delivery_purchase_vehicle_candidate', {
        subjectLabel: 'Kangoo L2',
        candidate: KANGOO,
      }),
    );
    expect(said).toContain(
      'Colette Martin a ajouté à la bibliothèque d’achat le véhicule candidat « Kangoo L2 » (chargement 220 × 150 × 125 cm',
    );
    expect(said).toContain('prix HT');
    expect(said).toContain('25');
  });

  it('dit un format au millimètre en cm à une décimale, et relit un ancien fait en cm', () => {
    const manne = {
      ...CAISSE,
      outer: { lengthMm: 665, widthMm: 460, heightMm: 715 },
      inner: { lengthMm: 645, widthMm: 440, heightMm: 695 },
    };
    const said = sentence(
      fact('delivery_purchase_bin_candidate.declared', 'delivery_purchase_bin_candidate', {
        subjectLabel: 'Manne',
        candidate: manne,
      }),
    );
    expect(said).toContain('extérieur 66,5 × 46 × 71,5 cm');
    expect(said).toContain('intérieur 64,5 × 44 × 69,5 cm');

    // CAISSE porte des cm entiers : un fait d'avant le 2026-10-07.
    const before = sentence(
      fact('delivery_purchase_bin_candidate.declared', 'delivery_purchase_bin_candidate', {
        subjectLabel: 'Caisse',
        candidate: CAISSE,
      }),
    );
    expect(before).toContain('extérieur 60 × 40 × 30 cm');
  });

  it('dit un prix absent « inconnu », jamais zéro', () => {
    const said = sentence(
      fact('delivery_purchase_bin_candidate.declared', 'delivery_purchase_bin_candidate', {
        subjectLabel: 'Caisse Dupont 50',
        candidate: CAISSE,
      }),
    );
    expect(said).toContain('prix unitaire HT inconnu');
    expect(said).toContain('sans lien d’achat');
  });

  it('ne dit d’une correction que ce qui a changé', () => {
    expect(
      sentence(
        fact('delivery_purchase_bin_candidate.corrected', 'delivery_purchase_bin_candidate', {
          subjectLabel: 'Caisse Dupont 50',
          before: CAISSE,
          after: { ...CAISSE, maxStack: 4 },
        }),
      ),
    ).toBe(
      'Colette Martin a corrigé le format candidat « Caisse Dupont 50 » : de pile de 5 au plus à pile de 4 au plus',
    );
  });

  it('dit l’archivage et la réactivation', () => {
    expect(
      sentence(
        fact(
          'delivery_purchase_vehicle_candidate.archived',
          'delivery_purchase_vehicle_candidate',
          {
            subjectLabel: 'Kangoo L2',
            candidate: KANGOO,
          },
        ),
      ),
    ).toContain('Colette Martin a archivé le véhicule candidat « Kangoo L2 »');
    expect(
      sentence(
        fact('delivery_purchase_bin_candidate.reactivated', 'delivery_purchase_bin_candidate', {
          subjectLabel: 'Caisse Dupont 50',
          candidate: CAISSE,
        }),
      ),
    ).toContain('Colette Martin a réactivé le format candidat « Caisse Dupont 50 »');
  });
});
