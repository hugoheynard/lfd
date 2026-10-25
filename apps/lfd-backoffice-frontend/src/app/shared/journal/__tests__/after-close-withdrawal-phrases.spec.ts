import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Retirée après l'arrêt du plan** (plan A1, lot A1.3) : les deux faits des
 * ateliers, et `order.cancelled` qui le dit. Jours recopiés, jamais comparés
 * à l'horloge.
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

describe('retirée après l’arrêt du plan (plan A1)', () => {
  it('le fournil : la commande retirée du plan, le compte à produire inchangé', () => {
    const said = sentence(
      fact(
        'production_day.order_withdrawn',
        { subjectLabel: DAY, serviceDay: DAY, orderId: 'o1', orderNumber: 'ORD-7' },
        { type: 'production_day', id: DAY },
      ),
    );
    expect(said).toContain('Colette Martin a retiré la commande ORD-7 du plan du ');
    expect(said).toContain('le compte à produire ne change pas');
  });

  it('le fournil : sans référence figée, « une commande », jamais un identifiant', () => {
    const said = sentence(
      fact(
        'production_day.order_withdrawn',
        { subjectLabel: DAY, serviceDay: DAY, orderId: 'o1', orderNumber: null },
        { type: 'production_day', id: DAY },
      ),
    );
    expect(said).toContain('a retiré une commande du plan');
    expect(said).not.toContain('o1');
  });

  it('le colisage : la feuille retirée, ce qui est rendu reste au détail', () => {
    const rendered = renderFact(
      fact(
        'packing_sheet.withdrawn',
        {
          subjectLabel: 'ORD-7',
          serviceDay: DAY,
          released: [{ sku: 'CRO', productName: 'Croissant', quantity: 3 }],
        },
        { type: 'order', id: 'o1' },
      ),
    );
    expect(rendered.sentence.replace(/\s/gu, ' ')).toContain(
      'Colette Martin a retiré du colisage la feuille de la commande ORD-7 du ',
    );
    expect(rendered.sentence).toContain('annulée après l’arrêt du plan');
  });

  it('`order.cancelled` après l’arrêt le dit ; avant, la phrase d’avant', () => {
    const base = {
      subjectLabel: 'Paul Martin',
      orderId: 'o1',
      orderNumber: 'ORD-7',
      cancelledBy: { id: 'fiche_1', name: 'Marie Fournier' },
      reason: 'Appel',
      regime: 'paid',
      voucher: null,
    };
    const subject = { type: 'user', id: 'u1' };
    expect(
      sentence(
        fact(
          'order.cancelled',
          { ...base, afterInscription: true, stageApplied: 'ready' },
          subject,
        ),
      ),
    ).toContain('Marie Fournier a annulé la commande ORD-7 après l’arrêt du plan');
    expect(sentence(fact('order.cancelled', base, subject))).not.toContain('après l’arrêt');
  });
});
