import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** Plan A1, lot A1.4 — la sortie de réserve. Jour recopié, jamais comparé à l'horloge. */
const DAY = '2030-03-12';

function sentOf(site: unknown): FactInput {
  return {
    type: 'packing_stock.sent_to_shop',
    payload: {
      subjectLabel: DAY,
      serviceDay: DAY,
      site,
      resupplyId: 'rsp_1',
      lines: [
        { sku: 'CRO', productName: 'Croissant', quantity: 2 },
        { sku: 'BAG', productName: 'Baguette', quantity: 1 },
      ],
    },
    subjectType: 'packing_stock',
    subjectId: DAY,
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

const sentence = (input: FactInput): string => renderFact(input).sentence.replace(/\s/gu, ' ');

describe('la sortie de réserve vers une boutique (plan A1, A1.4)', () => {
  it('dit combien de pièces, de quelle réserve, vers quel point', () => {
    const said = sentence(sentOf({ id: 'site_1', name: 'Village' }));

    expect(said).toContain('Colette Martin a envoyé en boutique 3 pièces de la réserve du ');
    expect(said).toContain('vers le point « Village »');
  });

  it('un point que l’annuaire ne nommait pas se cite par son identifiant', () => {
    expect(sentence(sentOf('site_1'))).toContain('vers un point (identifiant site_1)');
  });
});
