import type { FulfillmentMethod, OrderStatus, OrderView, PaymentStatus } from '@lfd/contracts';

import { buildTimeline, canSettle, toTimelineNodes, type TimelineStep } from '../order-timeline';

/** Une commande réduite aux trois champs dont la frise dépend. */
function order(
  status: OrderStatus,
  paymentStatus: PaymentStatus,
  fulfillmentMethod: FulfillmentMethod = 'pickup',
): OrderView {
  return { status, paymentStatus, fulfillmentMethod } as OrderView;
}

const keys = (steps: readonly TimelineStep[]): readonly string[] => steps.map((s) => s.key);
const stateOf = (steps: readonly TimelineStep[], key: string): string | undefined =>
  steps.find((s) => s.key === key)?.state;

describe('buildTimeline — régimes de règlement', () => {
  it('facturée au terme : le règlement est acquis, la production avance', () => {
    const steps = buildTimeline(order('in_production', 'not_required'));

    expect(stateOf(steps, 'payment')).toBe('done');
    expect(stateOf(steps, 'in_production')).toBe('current');
  });

  it('carte en attente : le règlement est l’étape courante, rien ne l’est en production', () => {
    const steps = buildTimeline(order('placed', 'pending'));

    expect(stateOf(steps, 'payment')).toBe('current');
    expect(steps.filter((s) => s.state === 'current')).toHaveLength(1);
  });

  it('carte en attente : la commande reste « reçue » — elle l’est vraiment', () => {
    expect(stateOf(buildTimeline(order('placed', 'pending')), 'placed')).toBe('done');
  });

  it('paiement échoué : l’étape est en échec et bloque aussi la production', () => {
    const steps = buildTimeline(order('placed', 'failed'));

    expect(stateOf(steps, 'payment')).toBe('failed');
    expect(steps.some((s) => s.state === 'current')).toBe(false);
  });

  it('remboursée : en échec, mais la production reste lisible', () => {
    const steps = buildTimeline(order('fulfilled', 'refunded'));

    expect(stateOf(steps, 'payment')).toBe('failed');
    expect(stateOf(steps, 'fulfilled')).toBe('current');
  });

  it('payée : le règlement est acquis', () => {
    expect(stateOf(buildTimeline(order('confirmed', 'paid')), 'payment')).toBe('done');
  });
});

describe('buildTimeline — acheminement', () => {
  it('un retrait passe par la mise à disposition en boutique', () => {
    expect(keys(buildTimeline(order('placed', 'paid', 'pickup')))).toEqual([
      'payment',
      'placed',
      'confirmed',
      'in_production',
      'ready',
      'fulfilled',
    ]);
  });

  it('une livraison ajoute la remise au coursier et le transit', () => {
    expect(keys(buildTimeline(order('placed', 'paid', 'delivery')))).toEqual([
      'payment',
      'placed',
      'confirmed',
      'in_production',
      'handover',
      'transit',
      'fulfilled',
    ]);
  });

  it('les jalons de transport ne sont suivis par aucune colonne', () => {
    const steps = buildTimeline(order('in_production', 'paid', 'delivery'));

    expect(steps.filter((s) => !s.tracked).map((s) => s.key)).toEqual(['handover', 'transit']);
  });

  it('un jalon non suivi n’est JAMAIS l’étape courante', () => {
    for (const status of ['placed', 'confirmed', 'in_production', 'fulfilled'] as const) {
      const steps = buildTimeline(order(status, 'paid', 'delivery'));
      const untracked = steps.filter((s) => !s.tracked);

      expect(untracked.filter((s) => s.state === 'current')).toEqual([]);
    }
  });

  it('les jalons non suivis s’allument à la remise', () => {
    const steps = buildTimeline(order('fulfilled', 'paid', 'delivery'));

    expect(steps.filter((s) => !s.tracked).every((s) => s.state === 'done')).toBe(true);
  });
});

describe('buildTimeline — annulation', () => {
  it('court-circuite la production, quel que soit l’acheminement', () => {
    expect(keys(buildTimeline(order('cancelled', 'refunded', 'delivery')))).toEqual([
      'payment',
      'cancelled',
    ]);
  });
});

describe('buildTimeline — invariants sur toute la matrice', () => {
  const STATUSES: readonly OrderStatus[] = [
    'draft',
    'placed',
    'confirmed',
    'in_production',
    'fulfilled',
    'cancelled',
  ];
  const PAYMENTS: readonly PaymentStatus[] = [
    'not_required',
    'pending',
    'paid',
    'failed',
    'refunded',
  ];
  const METHODS: readonly FulfillmentMethod[] = ['pickup', 'delivery'];

  it('rend au plus UNE étape courante — un rail n’a qu’une position', () => {
    const offenders: string[] = [];
    for (const status of STATUSES) {
      for (const payment of PAYMENTS) {
        for (const method of METHODS) {
          const current = buildTimeline(order(status, payment, method)).filter(
            (s) => s.state === 'current',
          );
          if (current.length > 1) {
            offenders.push(`${status}/${payment}/${method}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('ne rend jamais deux étapes de même clé', () => {
    const offenders: string[] = [];
    for (const status of STATUSES) {
      for (const payment of PAYMENTS) {
        for (const method of METHODS) {
          const all = keys(buildTimeline(order(status, payment, method)));
          if (new Set(all).size !== all.length) {
            offenders.push(`${status}/${payment}/${method}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('toTimelineNodes', () => {
  it('accentue l’étape courante autant que les acquises — sinon le rail s’arrête trop tôt', () => {
    const nodes = toTimelineNodes(buildTimeline(order('in_production', 'paid')));

    expect(nodes.find((n) => n.key === 'in_production')?.done).toBe(true);
  });

  it('l’échec n’est pas « fait »', () => {
    const nodes = toTimelineNodes(buildTimeline(order('placed', 'failed')));

    expect(nodes.find((n) => n.key === 'payment')?.done).toBe(false);
  });

  it('met en retrait un jalon non suivi tant que la commande n’est pas remise', () => {
    const nodes = toTimelineNodes(buildTimeline(order('in_production', 'paid', 'delivery')));

    expect(nodes.find((n) => n.key === 'transit')?.state).toBe('untracked');
  });

  it('un jalon non suivi redevient « fait » une fois la commande remise', () => {
    const nodes = toTimelineNodes(buildTimeline(order('fulfilled', 'paid', 'delivery')));

    expect(nodes.find((n) => n.key === 'transit')?.state).toBe('done');
  });

  it('aucun nœud n’est cliquable — la frise est un état, pas une navigation', () => {
    const nodes = toTimelineNodes(buildTimeline(order('placed', 'paid')));

    expect(nodes.filter((n) => n.clickable !== false)).toEqual([]);
  });
});

describe('canSettle', () => {
  it('reste vrai tant qu’il y a quelque chose à régler', () => {
    expect(['not_required', 'pending'].filter((s) => !canSettle(s as PaymentStatus))).toEqual([]);
  });

  it('est faux une fois le sort du règlement scellé', () => {
    expect(['paid', 'failed', 'refunded'].filter((s) => canSettle(s as PaymentStatus))).toEqual([]);
  });
});
