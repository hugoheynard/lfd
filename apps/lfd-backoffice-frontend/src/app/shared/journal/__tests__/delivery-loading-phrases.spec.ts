import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les phrases du chargement** (`delivery_bin.*`, `delivery_round.departed`, lot 4 et 4 bis). */

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

const ORDER = { id: 'o_1', name: 'CMD-1' };
const ROUND = { round: { id: 'r_1', name: 'Kangoo' }, day: '2026-10-01', passage: 2 };

describe('le chargement (delivery_bin.*, delivery_round.departed)', () => {
  it('dit la déclaration, le type, les sacs dedans, et les codes créés avec leur moitié', () => {
    expect(
      sentence(
        fact('delivery_bin.declared', 'order', {
          subjectLabel: 'CMD-1',
          binType: { id: 't_m', name: 'Bac M' },
          innerBags: 3,
          bins: [
            { bin: { id: 'b_1', name: 'ABC234' }, half: null },
            { bin: { id: 'b_2', name: 'ABC235' }, half: 'left' },
          ],
        }),
      ),
    ).toBe(
      'Colette Martin a déclaré 2 bacs de type « Bac M » pour la commande « CMD-1 », 3 sacs dans chacun : « ABC234 », « ABC235 » ½ gauche',
    );
  });

  it('se tait sur les sacs quand il n’y en a pas', () => {
    expect(
      sentence(
        fact('delivery_bin.declared', 'order', {
          subjectLabel: 'CMD-1',
          binType: { id: 't_m', name: 'Bac M' },
          innerBags: 0,
          bins: [{ bin: { id: 'b_1', name: 'ABC234' }, half: null }],
        }),
      ),
    ).toBe(
      'Colette Martin a déclaré un bac de type « Bac M » pour la commande « CMD-1 » : « ABC234 »',
    );
  });

  it('dit le partage d’un bac entre deux commandes', () => {
    expect(
      sentence(
        fact('delivery_bin.shared', 'order', {
          subjectLabel: 'CMD-2',
          binType: { id: 't_m', name: 'Bac M' },
          innerBags: 1,
          bin: { id: 'b_3', name: 'ABC236' },
          half: 'right',
          partner: { id: 'b_2', name: 'ABC235' },
          partnerOrder: ORDER,
        }),
      ),
    ).toBe(
      'Colette Martin a partagé un bac de type « Bac M » entre la commande « CMD-2 » et la commande « CMD-1 » : « ABC236 » ½ droite, face à « ABC235 », 1 sac dedans',
    );
  });

  it('cite le chargeur par son seul identifiant quand le nom manque', () => {
    expect(
      sentence(
        fact('delivery_bin.unloaded', 'delivery_bin', {
          subjectLabel: 'ABC234',
          order: ORDER,
          ...ROUND,
          loadedAt: '2026-10-01T05:42:00.000Z',
          loadedBy: 's_1',
        }),
      ),
    ).toContain('par quelqu’un (identifiant s_1)');
  });

  it('dit l’annulation d’un bac, et sa commande', () => {
    expect(
      sentence(
        fact('delivery_bin.voided', 'delivery_bin', { subjectLabel: 'ABC234', order: ORDER }),
      ),
    ).toBe('Colette Martin a annulé le bac « ABC234 » de la commande « CMD-1 »');
  });

  it('dit le chargement, la tournée et le chemin', () => {
    expect(
      sentence(
        fact('delivery_bin.loaded', 'delivery_bin', {
          subjectLabel: 'ABC234',
          order: 'o_9',
          ...ROUND,
          via: 'code',
        }),
      ),
    ).toBe(
      'Colette Martin a chargé le bac « ABC234 » d’une commande (identifiant o_9) dans la tournée « Kangoo » du 1 octobre 2026, passage 2, par son code tapé',
    );
  });

  it('garde au déchargement qui avait chargé', () => {
    expect(
      sentence(
        fact('delivery_bin.unloaded', 'delivery_bin', {
          subjectLabel: 'ABC234',
          order: ORDER,
          ...ROUND,
          passage: 1,
          loadedAt: '2026-10-01T05:42:00.000Z',
          loadedBy: { id: 's_1', name: 'Paul Durand' },
        }),
      ),
    ).toMatch(
      /^Colette Martin a déchargé le bac « ABC234 » de la commande « CMD-1 » de la tournée « Kangoo » du 1 octobre 2026 — chargé le .+ par Paul Durand$/u,
    );
  });

  it('dit le départ, ses arrêts et ses bacs', () => {
    expect(
      sentence(
        fact('delivery_round.departed', 'delivery_round', {
          subjectLabel: 'Kangoo',
          day: '2026-10-01',
          passage: 1,
          stops: 4,
          bins: 7,
        }),
      ),
    ).toBe(
      'Colette Martin a fait partir la tournée « Kangoo » du 1 octobre 2026 : 4 arrêts, 7 bacs',
    );
  });
});
