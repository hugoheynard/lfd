import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les phrases de la composition des tournées** (`delivery_round.*`, lot 3, C7). */

function fact(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'delivery_round',
    subjectId: 'r_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

const ROUND = { subjectLabel: 'Kangoo', day: '2026-10-01', passage: 2 };

describe('la composition des tournées (delivery_round.*)', () => {
  it('dit l’ouverture, avec le jour et le passage', () => {
    expect(sentence(fact('delivery_round.opened', ROUND))).toBe(
      'Colette Martin a ouvert la tournée « Kangoo » du 1 octobre 2026, passage 2',
    );
  });

  it('cite la commande affectée, et son rang', () => {
    expect(
      sentence(
        fact('delivery_round.stop_assigned', {
          ...ROUND,
          passage: 1,
          order: { id: 'o_1', name: 'CMD-1' },
          position: 3,
        }),
      ),
    ).toBe(
      'Colette Martin a affecté la commande « CMD-1 » à la tournée « Kangoo » du 1 octobre 2026 en position 3',
    );
  });

  it('dit un déplacement en UN fait, d’où il vient et où il arrive', () => {
    expect(
      sentence(
        fact('delivery_round.stop_moved', {
          ...ROUND,
          order: 'o_9',
          from: { round: { id: 'r_0', name: 'Trafic' }, passage: 1 },
          position: 1,
        }),
      ),
    ).toBe(
      'Colette Martin a déplacé une commande (identifiant o_9) de la tournée « Trafic » vers la tournée « Kangoo » du 1 octobre 2026, passage 2 en position 1',
    );
  });

  it('dit un retrait et un réordonnancement, avant et après', () => {
    expect(
      sentence(
        fact('delivery_round.stop_removed', { ...ROUND, order: { id: 'o_1', name: 'CMD-1' } }),
      ),
    ).toBe(
      'Colette Martin a retiré la commande « CMD-1 » de la tournée « Kangoo » du 1 octobre 2026, passage 2',
    );
    expect(
      sentence(
        fact('delivery_round.reordered', {
          ...ROUND,
          passage: 1,
          before: [
            { id: 'o_1', name: 'CMD-1' },
            { id: 'o_2', name: 'CMD-2' },
          ],
          after: [{ id: 'o_2', name: 'CMD-2' }, 'o_1'],
        }),
      ),
    ).toBe(
      'Colette Martin a réordonné la tournée « Kangoo » du 1 octobre 2026 : de « CMD-1 », « CMD-2 » à « CMD-2 », une commande (identifiant o_1)',
    );
  });

  it('dit l’affectation d’un livreur, et celui qu’il remplace (MT-D2)', () => {
    expect(
      sentence(
        fact('delivery_round.driver_assigned', {
          ...ROUND,
          passage: 1,
          driver: { id: 'staff_paul', name: 'Paul Roux' },
          previous: null,
        }),
      ),
    ).toBe('Colette Martin a affecté Paul Roux à la tournée « Kangoo » du 1 octobre 2026');
    expect(
      sentence(
        fact('delivery_round.driver_assigned', {
          ...ROUND,
          passage: 1,
          driver: 'staff_lea',
          previous: { id: 'staff_paul', name: 'Paul Roux' },
        }),
      ),
    ).toBe(
      'Colette Martin a affecté un livreur (identifiant staff_lea) à la tournée « Kangoo » du 1 octobre 2026 à la place de Paul Roux',
    );
  });

  it('dit le retrait du livreur', () => {
    expect(
      sentence(
        fact('delivery_round.driver_unassigned', {
          ...ROUND,
          passage: 1,
          previous: { id: 'staff_paul', name: 'Paul Roux' },
        }),
      ),
    ).toBe(
      'Colette Martin a retiré le livreur Paul Roux de la tournée « Kangoo » du 1 octobre 2026',
    );
  });
});
