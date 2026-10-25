import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Quantités changées après l'arrêt du plan** (plan A2, § 7) : les deux faits
 * des ateliers. Jours recopiés, jamais comparés à l'horloge.
 */

const DAY = '2030-03-12';

function fact(
  type: string,
  payload: Record<string, unknown>,
  subject: { readonly type: string; readonly id: string },
): FactInput {
  return {
    type,
    payload,
    subjectType: subject.type,
    subjectId: subject.id,
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

describe('quantités changées après l’arrêt du plan (plan A2)', () => {
  it('le fournil : la commande montée au plan, et ce qui monte', () => {
    const said = sentence(
      fact(
        'production_day.order_quantities_raised',
        {
          subjectLabel: DAY,
          serviceDay: DAY,
          orderId: 'o1',
          orderNumber: 'ORD-7',
          lines: [{ sku: 'BAG', productName: 'Baguette', from: 10, to: 12 }],
        },
        { type: 'production_day', id: DAY },
      ),
    );
    expect(said).toContain('Colette Martin a monté la commande ORD-7 au plan du ');
    expect(said).toContain('+2 Baguette');
  });

  it('le colisage : la feuille révisée, de → à, dans les deux sens', () => {
    const said = sentence(
      fact(
        'packing_sheet.revised',
        {
          subjectLabel: 'ORD-7',
          serviceDay: DAY,
          lines: [
            { sku: 'BAG', productName: 'Baguette', from: 10, to: 12 },
            { sku: 'CRO', productName: 'Croissant', from: 6, to: 4 },
          ],
        },
        { type: 'order', id: 'o1' },
      ),
    );
    expect(said).toContain('a révisé la feuille de colisage de la commande ORD-7 du ');
    expect(said).toContain('+2 Baguette, −2 Croissant');
  });
});
