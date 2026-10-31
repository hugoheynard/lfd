import { describe, expect, it } from 'vitest';

import { emptyDraft, type PromotionDraft } from '../promotion-draft';
import { draftSummary } from '../promotion-summary';

const draft = (over: Partial<PromotionDraft>): PromotionDraft => ({
  ...emptyDraft('2026-11-01', null),
  effectValue: '20',
  ...over,
});
const NAMES = new Map([
  ['c_choc', 'Chocolaterie'],
  ['c_pains', 'Pains'],
]);
const PICKUPS = new Map([['pk_coeur', 'Cœur de station']]);

describe('draftSummary', () => {
  it('dit la promotion en une phrase, dans l’ordre où on la pense', () => {
    expect(
      draftSummary(
        draft({
          audiences: [
            { kind: 'pros', companyId: null },
            { kind: 'individuals_registered', companyId: null },
          ],
          rules: [{ target: 'category', targetId: 'c_choc', eligible: false }],
          fulfillmentKind: 'basket',
          delivery: { on: true, all: true, ids: [] },
        }),
        NAMES,
        PICKUPS,
      ),
    ).toBe(
      '−20 % pour les pros et les particuliers inscrits, sur tout sauf Chocolaterie, en livraison, dès le 1 novembre 2026',
    );
  });

  it('dit « à préciser » plutôt que d’inventer une valeur ou un public', () => {
    const phrase = draftSummary(draft({ effectValue: '', audiences: [] }), NAMES, PICKUPS);
    expect(phrase).toContain('Une remise à préciser pour un public à choisir');
  });

  it('nomme le point, la sélection et la fin (dernier jour couvert, la veille de la borne)', () => {
    const phrase = draftSummary(
      draft({
        fulfillmentKind: 'basket',
        pickup: { on: true, all: false, ids: ['pk_coeur'] },
        scopeMode: 'only',
        rules: [{ target: 'category', targetId: 'c_pains', eligible: true }],
        validTo: '2026-12-01',
      }),
      NAMES,
      PICKUPS,
    );
    expect(phrase).toContain('seulement sur Pains');
    expect(phrase).toContain('au retrait à Cœur de station');
    expect(phrase).toContain('du 1 novembre 2026 au 30 novembre 2026');
  });

  it('dit l’ensemble : les points et les zones, nommés', () => {
    const ZONES = new Map([
      ['z_centre', 'Centre'],
      ['z_nord', 'Nord'],
    ]);
    const both = draftSummary(
      draft({
        fulfillmentKind: 'basket',
        pickup: { on: true, all: false, ids: ['pk_coeur', 'pk_adroit'] },
        delivery: { on: true, all: false, ids: ['z_centre'] },
      }),
      NAMES,
      new Map([...PICKUPS, ['pk_adroit', "L'adroit"]]),
      ZONES,
    );
    expect(both).toContain(
      "au retrait à Cœur de station et L'adroit et en livraison dans la zone Centre",
    );
    const zones = draftSummary(
      draft({
        fulfillmentKind: 'basket',
        pickup: { on: true, all: true, ids: [] },
        delivery: { on: true, all: false, ids: ['z_centre', 'z_nord'] },
      }),
      NAMES,
      PICKUPS,
      ZONES,
    );
    expect(zones).toContain('au retrait et en livraison dans les zones Centre et Nord');
    expect(draftSummary(draft({ fulfillmentKind: 'basket' }), NAMES, PICKUPS)).toContain(
      'à un acheminement à choisir',
    );
    expect(draftSummary(draft({}), NAMES, PICKUPS)).toContain(
      "dans le prix affiché, quel que soit l'acheminement",
    );
  });

  it('compte au-delà de trois exceptions', () => {
    const rules = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      target: 'category' as const,
      targetId: id,
      eligible: false,
    }));
    expect(draftSummary(draft({ rules }), NAMES, PICKUPS)).toContain('sauf a, b, c et 2 autres');
  });
});
