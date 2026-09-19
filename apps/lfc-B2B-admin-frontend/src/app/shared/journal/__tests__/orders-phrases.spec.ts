import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les phrases des commandes et de la production** (lot D du plan des phrases
 * du journal) : la forme courante de chaque charge, et ses formes d'avant le
 * lot B quand il y en a.
 */

function fact(overrides: Partial<FactInput> & Pick<FactInput, 'type'>): FactInput {
  return {
    payload: {},
    subjectType: overrides.type.slice(0, overrides.type.lastIndexOf('.')),
    subjectId: 'sujet_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
    ...overrides,
  };
}

/** Les espaces insécables des nombres français, rendus lisibles pour l'assertion. */
function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

function row(input: FactInput, label: string): string | undefined {
  return renderFact(input)
    .detail.find((candidate) => candidate.label === label)
    ?.value.replace(/\s/gu, ' ');
}

describe('la passation d’une commande (order.placed)', () => {
  const placed = (actorName: string, subjectLabel?: string): FactInput =>
    fact({
      type: 'order.placed',
      subjectType: 'user',
      actorName,
      actorType: 'customer',
      payload: {
        ...(subjectLabel === undefined ? {} : { subjectLabel }),
        orderId: 'ord_1',
        orderNumber: 'ORD-142',
        companyId: null,
        totalCents: 1_250,
      },
    });

  it('met l’auteur en sujet, et ne répète pas le client quand c’est lui', () => {
    expect(sentence(placed('Jean Dupont', 'Jean Dupont'))).toBe(
      'Jean Dupont a passé la commande ORD-142',
    );
    expect(renderFact(placed('Jean Dupont', 'Jean Dupont')).namesActor).toBe(true);
  });

  it('nomme le client quand l’équipe commande pour lui', () => {
    expect(sentence({ ...placed('Colette Martin', 'Jean Dupont'), actorType: 'staff' })).toBe(
      'Colette Martin a passé la commande ORD-142 pour Jean Dupont',
    );
  });
});

describe('les réglages du retrait, de la livraison et des heures limites', () => {
  it('met l’auteur en sujet d’une zone, d’un point de retrait, de ses créneaux', () => {
    expect(
      sentence(
        fact({ type: 'delivery_zone.created', payload: { subjectLabel: 'Paris', label: 'Paris' } }),
      ),
    ).toBe('Colette Martin a créé la zone de livraison « Paris »');
    expect(sentence(fact({ type: 'delivery_zone.removed', payload: {} }))).toBe(
      'Colette Martin a supprimé une zone de livraison',
    );
    expect(
      sentence(fact({ type: 'pickup_address.default_set', payload: { subjectLabel: 'Halles' } })),
    ).toBe('Colette Martin a désigné le point de retrait « Halles » comme point par défaut');
    expect(
      sentence(
        fact({
          type: 'public_pickup_schedule.updated',
          payload: {
            subjectLabel: 'Halles',
            label: 'Halles',
            ruleCount: 1,
            closureCount: 0,
            configured: true,
          },
        }),
      ),
    ).toBe('Colette Martin a réglé les créneaux publics du point de retrait « Halles » (1 plage)');
  });

  it('dit l’heure limite posée, portée, supprimée', () => {
    const rule = {
      pickupAddress: null,
      weekday: null,
      daysBefore: 1,
      time: '17:30',
      graceMinutes: 0,
    };

    expect(sentence(fact({ type: 'order_cutoff.created', payload: rule }))).toBe(
      'Colette Martin a posé une heure limite à 17:30',
    );
    expect(sentence(fact({ type: 'order_cutoff.removed', payload: rule }))).toBe(
      'Colette Martin a supprimé l’heure limite de 17:30',
    );
    expect(sentence(fact({ type: 'order_cutoff.removed', payload: {} }))).toBe(
      'Colette Martin a supprimé une heure limite',
    );
  });
});

describe('le retrait d’une commande (order.handed_over)', () => {
  const current = fact({
    type: 'order.handed_over',
    subjectType: 'user',
    actorName: 'Hugo Heynard',
    payload: {
      subjectLabel: 'Jean Dupont',
      orderId: 'ord_1',
      orderNumber: 'ORD-7',
      handedOverBy: { id: 'stf_1', name: 'Cécile Martin' },
      handedOverAt: '2026-09-19T08:00:00.000Z',
      via: 'scan',
    },
  });

  it('nomme la fiche qui a validé le retrait, et comment', () => {
    expect(sentence(current)).toBe(
      'Cécile Martin a validé le retrait de la commande ORD-7 en scannant le QR du client — Jean Dupont',
    );
    expect(renderFact(current).namesActor).toBe(false);
    expect(row(current, 'Par')).toBeUndefined();
  });

  it('dit une saisie à la main', () => {
    const manual = { ...current, payload: { ...current.payload, via: 'manual' } };

    expect(sentence(manual)).toBe(
      'Cécile Martin a validé le retrait de la commande ORD-7 à la main, sans le QR — Jean Dupont',
    );
  });

  it('nomme l’auteur de la ligne quand une ligne ancienne ne cite que l’identifiant', () => {
    const old = fact({
      type: 'order.handed_over',
      subjectType: 'user',
      actorName: 'Cécile Martin',
      payload: {
        orderId: 'ord_1',
        orderNumber: 'ORD-7',
        handedOverBy: 'stf_1',
        handedOverAt: '2026-09-19T08:00:00.000Z',
        via: 'scan',
      },
    });

    expect(sentence(old)).toBe(
      'Cécile Martin a validé le retrait de la commande ORD-7 en scannant le QR du client',
    );
    expect(renderFact(old).namesActor).toBe(true);
    // « Retrait », jamais « remise » : ce mot ne désigne que la réduction de prix.
    expect(row(old, 'Retrait validé par')).toBe('(identifiant stf_1)');
    expect(row(old, 'Retirée le')).toBeDefined();
  });
});

describe('les dérogations d’heure limite', () => {
  const decision = {
    company: { id: 'co_1', name: 'Café des Halles' },
    fulfillmentDate: '2026-09-19',
    reason: 'Livraison oubliée',
  };

  it('dit le client et la journée ; le motif reste au détail', () => {
    const granted = fact({ type: 'order_cutoff_waiver.granted', payload: decision });

    expect(sentence(granted)).toBe(
      'Colette Martin a accordé une dérogation à l’heure limite au client « Café des Halles » pour le 19 septembre 2026',
    );
    expect(row(granted, 'Motif')).toBe('Livraison oubliée');
  });

  it('dit le retrait d’une dérogation', () => {
    expect(sentence(fact({ type: 'order_cutoff_waiver.revoked', payload: decision }))).toBe(
      'Colette Martin a retiré la dérogation à l’heure limite accordée au client « Café des Halles » pour le 19 septembre 2026',
    );
  });

  it('ne cite le client que par son identifiant sur une ligne d’avant le lot B', () => {
    const old = fact({
      type: 'order_cutoff_waiver.granted',
      payload: { companyId: 'co_1', fulfillmentDate: '2026-09-19', reason: 'Oubli' },
    });

    expect(sentence(old)).toBe(
      'Colette Martin a accordé une dérogation à l’heure limite à un client (identifiant co_1) pour le 19 septembre 2026',
    );
    expect(row(old, 'Client')).toBeUndefined();
  });
});

describe('la surtaxe de retard', () => {
  const fiveEuros = { fee: { mode: 'amount', cents: 500 }, vatRatePercent: 20 };
  const tenPercent = { fee: { mode: 'percent', bp: 1_000 }, vatRatePercent: 5.5 };

  it('dit une première pose, montant HT et taux', () => {
    expect(
      sentence(fact({ type: 'order_late_fee.set', payload: { before: null, after: fiveEuros } })),
    ).toBe('Colette Martin a posé la surtaxe de retard : 5,00 € HT (TVA 20 %)');
  });

  it('dit l’avant et l’après d’un changement', () => {
    const changed = fact({
      type: 'order_late_fee.set',
      payload: { before: fiveEuros, after: tenPercent },
    });

    expect(sentence(changed)).toBe(
      'Colette Martin a passé la surtaxe de retard de 5,00 € HT (TVA 20 %) à 10 % du sous-total (TVA 5,5 %)',
    );
    expect(renderFact(changed).detail).toEqual([]);
  });

  it('dit ce que valait la surtaxe retirée', () => {
    expect(sentence(fact({ type: 'order_late_fee.cleared', payload: { before: fiveEuros } }))).toBe(
      'Colette Martin a retiré la surtaxe de retard, qui était de 5,00 € HT (TVA 20 %) : les dérogations ne coûtent plus rien',
    );
  });
});

describe('la journée de production', () => {
  it('dit la date en français, jamais l’ISO du libellé', () => {
    const closed = fact({
      type: 'production_day.closed',
      subjectId: '2026-09-19',
      payload: { subjectLabel: '2026-09-19', serviceDay: '2026-09-19', absorbed: 12 },
    });

    expect(sentence(closed)).toBe(
      'Colette Martin a arrêté le plan du 19 septembre 2026 : 12 commandes inscrites',
    );
    expect(renderFact(closed).detail).toEqual([]);
  });

  it('dit une reprise, au singulier quand il le faut, sur une ligne d’avant le lot B', () => {
    const retaken = fact({
      type: 'production_day.retaken',
      payload: { serviceDay: '2026-09-19', absorbed: 1 },
    });

    expect(sentence(retaken)).toBe(
      'Colette Martin a repris le plan du 19 septembre 2026 : 1 commande ajoutée',
    );
  });
});

describe('le contenant d’un article', () => {
  const plaque = { unitsPerContainer: 12, singular: 'plaque', plural: 'plaques' };
  const tourneau = { unitsPerContainer: 6, singular: 'tourneau', plural: 'tourneaux' };

  it('dit une première pose, l’article par son SKU', () => {
    const set = fact({
      type: 'production_container.set',
      subjectId: 'TAR-001',
      payload: { subjectLabel: 'TAR-001', before: null, after: plaque },
    });

    expect(sentence(set)).toBe(
      'Colette Martin a réglé le contenant de l’article TAR-001 : 12 unités par plaque',
    );
    expect(renderFact(set).detail).toEqual([]);
  });

  it('dit l’avant et l’après, et un pluriel qui ne se devine pas', () => {
    expect(
      sentence(
        fact({
          type: 'production_container.set',
          payload: { subjectLabel: 'TAR-001', before: plaque, after: tourneau },
        }),
      ),
    ).toBe(
      'Colette Martin a réglé le contenant de l’article TAR-001 : de 12 unités par plaque à 6 unités par tourneau (au pluriel « tourneaux »)',
    );
  });

  it('nomme l’article par l’identifiant du sujet — son SKU — sur une ligne d’avant le lot B', () => {
    const removed = fact({
      type: 'production_container.removed',
      subjectId: 'TAR-001',
      payload: { before: plaque },
    });

    expect(sentence(removed)).toBe(
      'Colette Martin a retiré le contenant de l’article TAR-001, qui était de 12 unités par plaque',
    );
  });
});
