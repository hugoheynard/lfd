import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les phrases du chargement** (`delivery_bag.*`, `delivery_round.departed`, lot 4). */

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

describe('le chargement (delivery_bag.*, delivery_round.departed)', () => {
  it('dit la déclaration et les codes créés', () => {
    expect(
      sentence(
        fact('delivery_bag.declared', 'order', {
          subjectLabel: 'CMD-1',
          bags: [
            { id: 'b_1', name: 'ABC234' },
            { id: 'b_2', name: 'ABC235' },
          ],
        }),
      ),
    ).toBe('Colette Martin a déclaré 2 sacs pour la commande « CMD-1 » : « ABC234 », « ABC235 »');
  });

  it('cite le chargeur par son seul identifiant quand le nom manque', () => {
    expect(
      sentence(
        fact('delivery_bag.unloaded', 'delivery_bag', {
          subjectLabel: 'ABC234',
          order: ORDER,
          ...ROUND,
          loadedAt: '2026-10-01T05:42:00.000Z',
          loadedBy: 's_1',
        }),
      ),
    ).toContain('par quelqu’un (identifiant s_1)');
  });

  it('dit l’annulation d’un sac, et sa commande', () => {
    expect(
      sentence(
        fact('delivery_bag.voided', 'delivery_bag', { subjectLabel: 'ABC234', order: ORDER }),
      ),
    ).toBe('Colette Martin a annulé le sac « ABC234 » de la commande « CMD-1 »');
  });

  it('dit le chargement, la tournée et le chemin', () => {
    expect(
      sentence(
        fact('delivery_bag.loaded', 'delivery_bag', {
          subjectLabel: 'ABC234',
          order: 'o_9',
          ...ROUND,
          via: 'code',
        }),
      ),
    ).toBe(
      'Colette Martin a chargé le sac « ABC234 » d’une commande (identifiant o_9) dans la tournée « Kangoo » du 1 octobre 2026, passage 2, par son code tapé',
    );
  });

  it('garde au déchargement qui avait chargé', () => {
    expect(
      sentence(
        fact('delivery_bag.unloaded', 'delivery_bag', {
          subjectLabel: 'ABC234',
          order: ORDER,
          ...ROUND,
          passage: 1,
          loadedAt: '2026-10-01T05:42:00.000Z',
          loadedBy: { id: 's_1', name: 'Paul Durand' },
        }),
      ),
    ).toMatch(
      /^Colette Martin a déchargé le sac « ABC234 » de la commande « CMD-1 » de la tournée « Kangoo » du 1 octobre 2026 — chargé le .+ par Paul Durand$/u,
    );
  });

  it('dit le départ, ses arrêts et ses sacs', () => {
    expect(
      sentence(
        fact('delivery_round.departed', 'delivery_round', {
          subjectLabel: 'Kangoo',
          day: '2026-10-01',
          passage: 1,
          stops: 4,
          bags: 7,
        }),
      ),
    ).toBe(
      'Colette Martin a fait partir la tournée « Kangoo » du 1 octobre 2026 : 4 arrêts, 7 sacs',
    );
  });
});
