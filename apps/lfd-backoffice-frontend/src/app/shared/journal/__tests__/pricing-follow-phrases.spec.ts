import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Le suivi d'une mercuriale, au journal général** (`plan-sous-comptes.md`,
 * S3) : la copie de l'acte de prix, écrite sur le sous-compte ET sur le
 * principal. Elle tient lieu de `company.parent_followed` pour le tarif.
 */

function onCompany(type: string, subjectId: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'company',
    subjectId,
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

const SITE = { id: 'co_site', name: 'Club Med Chamonix' };
const GROUP = { id: 'co_group', name: 'Club Med' };
const FROM = '2026-09-01T08:00:00.000Z';
const TO = '2026-10-01T08:00:00.000Z';

describe('le suivi d’une mercuriale', () => {
  it('se dit sur le sous-compte qui commence et cesse de suivre', () => {
    const started = onCompany('pricing_follow.started', SITE.id, {
      subjectLabel: SITE.name,
      summary: 'Suit la mercuriale de Club Med depuis le 1er septembre 2026',
      reason: null,
      parent: GROUP,
      validFrom: FROM,
    });
    const ended = onCompany('pricing_follow.ended', SITE.id, {
      subjectLabel: SITE.name,
      summary: 'Ne suit plus la mercuriale de Club Med (le 1er octobre 2026)',
      reason: null,
      parent: GROUP,
      validFrom: FROM,
      validTo: TO,
    });

    expect(renderFact(started).sentence).toBe(
      'Colette Martin a aligné le tarif du client « Club Med Chamonix » sur la mercuriale du compte principal « Club Med »',
    );
    expect(renderFact(ended).sentence).toBe(
      'Colette Martin a désaligné le tarif du client « Club Med Chamonix » de la mercuriale du compte principal « Club Med »',
    );
  });

  it('se dit sur le principal qui gagne et perd un sous-compte', () => {
    const joined = onCompany('pricing_follower.joined', GROUP.id, {
      subjectLabel: GROUP.name,
      summary: 'Club Med Chamonix suit votre mercuriale depuis le 1er septembre 2026',
      reason: null,
      child: SITE,
      validFrom: FROM,
    });

    expect(renderFact(joined).sentence).toBe(
      'Colette Martin a aligné le sous-compte « Club Med Chamonix » sur la mercuriale du client « Club Med »',
    );
  });
});
