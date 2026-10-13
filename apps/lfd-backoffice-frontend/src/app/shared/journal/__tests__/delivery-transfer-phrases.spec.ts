import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les phrases du transfert interne** (lot T1, 2026-10-13). */

function fact(type: string, subjectType: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType,
    subjectId: 'x_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

const TRANSFER = { subjectLabel: 'Val Village', day: '2026-10-01' };
const ROUND = { subjectLabel: 'Kangoo', day: '2026-10-01', passage: 2 };

describe('le transfert interne (internal_transfer.*, delivery_round.transfer_stop_*)', () => {
  it('dit l’ouverture d’un transfert, par son site et son jour', () => {
    expect(sentence(fact('internal_transfer.opened', 'internal_transfer', TRANSFER))).toBe(
      'Colette Martin a ouvert le transfert vers « Val Village » du 1 octobre 2026',
    );
  });

  it('dit la tournée où il est placé, et une tournée dédiée', () => {
    expect(
      sentence(
        fact('internal_transfer.placed', 'internal_transfer', {
          ...TRANSFER,
          round: { id: 'r_1', name: 'Kangoo' },
          passage: 1,
          dedicated: true,
        }),
      ),
    ).toBe(
      'Colette Martin a placé le transfert vers « Val Village » du 1 octobre 2026 dans la tournée « Kangoo », tournée dédiée',
    );
  });

  it('dit pourquoi il reste sans arrêt', () => {
    expect(
      sentence(
        fact('internal_transfer.unplaced', 'internal_transfer', {
          ...TRANSFER,
          cause: 'no_vehicle',
        }),
      ),
    ).toBe(
      'Colette Martin n’a placé le transfert vers « Val Village » du 1 octobre 2026 dans aucune tournée : aucune tournée ni véhicule libre',
    );
  });

  it('dit le déplacement et le retrait de son arrêt', () => {
    expect(
      sentence(
        fact('delivery_round.transfer_stop_moved', 'delivery_round', {
          ...ROUND,
          transfer: { id: 't_1', name: 'Val Village' },
          from: { round: { id: 'r_0', name: 'Trafic' }, passage: 1 },
          position: 3,
        }),
      ),
    ).toBe(
      'Colette Martin a déplacé le transfert vers « Val Village » de la tournée « Trafic » vers la tournée « Kangoo » du 1 octobre 2026, passage 2 en position 3',
    );
    expect(
      sentence(
        fact('delivery_round.transfer_stop_removed', 'delivery_round', {
          ...ROUND,
          transfer: { id: 't_1', name: 'Val Village' },
        }),
      ),
    ).toBe(
      'Colette Martin a retiré le transfert vers « Val Village » de la tournée « Kangoo » du 1 octobre 2026, passage 2',
    );
  });
});
