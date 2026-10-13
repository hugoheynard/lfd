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

  it('dit la réception au site, et une réception manuelle avec son motif (lot T2)', () => {
    expect(
      sentence(
        fact('internal_transfer.received', 'internal_transfer', {
          ...TRANSFER,
          via: 'site_drop',
          manual: false,
          reason: null,
        }),
      ),
    ).toBe('Colette Martin a remis au site le transfert vers « Val Village » du 1 octobre 2026');
    expect(
      sentence(
        fact('internal_transfer.received', 'internal_transfer', {
          ...TRANSFER,
          via: 'counter',
          manual: true,
          reason: 'Venu par le personnel',
        }),
      ),
    ).toBe(
      'Colette Martin a réceptionné le transfert vers « Val Village » du 1 octobre 2026, sans tournée : Venu par le personnel',
    );
  });

  it('dit le retrait d’une commande, et celle qui reste dans un transfert parti (lot T2)', () => {
    const order = { id: 'o_1', name: 'CMD-0042' };
    expect(
      sentence(
        fact('internal_transfer.order_detached', 'internal_transfer', {
          ...TRANSFER,
          order,
          cause: 'cancelled',
        }),
      ),
    ).toBe(
      'Colette Martin a retiré la commande « CMD-0042 » (annulée) du transfert vers « Val Village » du 1 octobre 2026',
    );
    expect(
      sentence(
        fact('internal_transfer.order_kept', 'internal_transfer', {
          ...TRANSFER,
          order,
          cause: 'moved',
          state: 'departed',
        }),
      ),
    ).toContain('déjà parti : le manifeste reste inchangé');
  });

  it('dit les bacs déclarés pour un transfert (lot T3)', () => {
    expect(
      sentence(
        fact('internal_transfer.bins_declared', 'internal_transfer', {
          ...TRANSFER,
          binType: { id: 'bt_1', name: 'Bac M' },
          innerBags: 3,
          bins: [
            { id: 'b_1', name: 'ABC234' },
            { id: 'b_2', name: 'ABC235' },
          ],
        }),
      ),
    ).toBe(
      'Colette Martin a déclaré 2 bacs de type « Bac M » pour le transfert vers « Val Village » du 1 octobre 2026, 3 sacs dans chacun : « ABC234 », « ABC235 »',
    );
  });

  it('compte les bacs à la réception (lot T3), et n’en dit rien avant', () => {
    const received = { ...TRANSFER, via: 'counter', manual: false, reason: null };
    expect(
      sentence(fact('internal_transfer.received', 'internal_transfer', { ...received, bins: 3 })),
    ).toBe(
      'Colette Martin a réceptionné le transfert vers « Val Village » du 1 octobre 2026, 3 bacs',
    );
    expect(sentence(fact('internal_transfer.received', 'internal_transfer', received))).toBe(
      'Colette Martin a réceptionné le transfert vers « Val Village » du 1 octobre 2026',
    );
  });
});
