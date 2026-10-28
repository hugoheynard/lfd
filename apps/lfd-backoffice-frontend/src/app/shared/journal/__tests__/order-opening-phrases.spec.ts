import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **L'ouverture de la boutique** (`order_opening.updated`, 2026-10-09). */

function updated(payload: Readonly<Record<string, unknown>>): FactInput {
  return {
    type: 'order_opening.updated',
    payload,
    subjectType: 'order_opening',
    subjectId: 'orders',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

const sentence = (input: FactInput): string => renderFact(input).sentence.replace(/\s/gu, ' ');

describe('l’ouverture de la boutique (order_opening.updated)', () => {
  it('dit la clientèle fermée, puis celle qui reste ouverte', () => {
    const input = updated({
      ordersOpenToB2b: true,
      ordersOpenToB2c: false,
      previous: { ordersOpenToB2b: true, ordersOpenToB2c: true },
    });

    expect(sentence(input)).toBe(
      'Colette Martin a fermé les commandes aux particuliers ; elles restent ouvertes aux professionnels',
    );
    expect(renderFact(input).detail).toEqual([]);
  });

  it('dit la réouverture', () => {
    expect(
      sentence(
        updated({
          ordersOpenToB2b: true,
          ordersOpenToB2c: false,
          previous: { ordersOpenToB2b: false, ordersOpenToB2c: false },
        }),
      ),
    ).toBe(
      'Colette Martin a rouvert les commandes aux professionnels ; elles restent fermées aux particuliers',
    );
  });

  it('dit le premier jour commandable posé et celui retiré', () => {
    const input = updated({
      ordersOpenToB2b: true,
      ordersOpenToB2c: true,
      firstServiceDayB2b: null,
      firstServiceDayB2c: '2026-10-30',
      previous: {
        ordersOpenToB2b: true,
        ordersOpenToB2c: true,
        firstServiceDayB2b: '2026-10-29',
        firstServiceDayB2c: null,
      },
    });

    expect(sentence(input)).toBe(
      'Colette Martin a retiré la date de début des commandes des professionnels et a fixé le début des commandes des particuliers au 30 octobre 2026 ; elles restent ouvertes aux professionnels et aux particuliers',
    );
    expect(renderFact(input).detail).toEqual([]);
  });

  it('retombe sur la phrase générale si la charge est incomplète', () => {
    expect(sentence(updated({ ordersOpenToB2b: true }))).toBe(
      'Colette Martin a réglé l’ouverture de la boutique',
    );
  });
});

/** Les exemptions à la fermeture (décision de Hugo du 2026-10-26). */
describe('les exemptions à la fermeture (order_opening.exemption_*)', () => {
  function exemption(type: string, payload: Readonly<Record<string, unknown>>): FactInput {
    return {
      type,
      payload,
      subjectType: 'order_opening',
      subjectId: 'ex_1',
      actorName: 'Colette Martin',
      actorType: 'staff',
    };
  }

  it('dit la société laissée commander, sans détail résiduel', () => {
    const input = exemption('order_opening.exemption_granted', {
      subjectLabel: 'Chez Paul',
      kind: 'company',
      company: { id: 'c1', name: 'Chez Paul' },
    });

    expect(sentence(input)).toBe(
      'Colette Martin a laissé commander la société Chez Paul malgré la fermeture de la boutique',
    );
    expect(renderFact(input).detail).toEqual([]);
  });

  it('dit le retrait d’une adresse', () => {
    expect(
      sentence(
        exemption('order_opening.exemption_withdrawn', {
          subjectLabel: 'jean@folie.fr',
          kind: 'email',
          company: null,
        }),
      ),
    ).toBe(
      'Colette Martin a retiré l’exemption de l’adresse jean@folie.fr : la fermeture de la boutique s’y applique de nouveau',
    );
  });
});
