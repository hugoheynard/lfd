import type { OrderView } from '@lfd/contracts';

import { historyRowOf, isLive, trackedOf, type RowCopy } from './order-rows';

const COPY: RowCopy = {
  pickup: 'Retrait',
  delivery: 'Coursier',
  stepPlaced: 'Panier validé',
  stepBakery: 'Au fournil',
  stepReady: 'Prête',
  stepHandedPickup: 'Retirée',
  stepHandedDelivery: 'Livrée',
  qrReady: 'Votre QR est prêt',
  noWindow: 'Aucune tranche demandée',
};

/** Une commande de retrait, telle que `GET /companies/:id/orders` la rend. */
const ORDER = {
  id: 'ord_1',
  orderNumber: 'CMD-0007',
  status: 'placed',
  paymentStatus: 'not_required',
  requestedDeliveryDate: '2026-09-07',
  fulfillmentMethod: 'pickup',
  deliveryAddress: null,
  pickupAddress: { label: 'Le Labo', ligne1: '', ligne2: '', codePostal: '', ville: '', pays: '' },
  fulfillment: { window: { value: { start: '07:00', end: '08:00' }, source: 'request' } },
  subtotalCents: 9_000,
  totalCents: 9_640,
  origin: 'self_service',
  placedAt: '2026-09-06T07:04:00.000Z',
  lines: [
    { sku: 'VIE-001', quantity: 4 },
    { sku: 'PAI-001', quantity: 3 },
  ],
  handoverToken: 'tok_1',
  handedOverAt: null,
} as unknown as OrderView;

/**
 * 🔴 Ces lignes venaient d'un fichier de maquette. Ce qui compte ici est autant
 * ce qu'elles portent que ce qu'elles ont **cessé** d'affirmer.
 */
describe('les lignes de l’écran des commandes', () => {
  it('compte les PIÈCES, pas les lignes', () => {
    expect(historyRowOf(ORDER, 'Les Tommeuses', COPY).pieces).toBe(7);
  });

  it('lit le lieu FIGÉ sur la commande, pas le réglage d’aujourd’hui', () => {
    expect(trackedOf(ORDER, COPY).kind).toBe('Retrait · Le Labo');
  });

  /** `not_required` = portée au compte ; tout le reste est passé par la carte. */
  it('déduit le régime de règlement de l’état du paiement', () => {
    expect(historyRowOf(ORDER, '', COPY).payment).toBe('account');
    expect(historyRowOf({ ...ORDER, paymentStatus: 'paid' } as OrderView, '', COPY).payment).toBe(
      'card',
    );
  });

  /**
   * **Seules deux étapes sur quatre sont datées.** Rien ne dit à quelle heure
   * une commande entre au fournil ; une heure plausible serait une heure fausse.
   */
  it('ne date que la passation et la remise', () => {
    const steps = trackedOf(ORDER, COPY).steps;

    expect(steps).toHaveLength(4);
    expect(steps[0]?.at).not.toBe('');
    expect(steps[1]?.at).toBe('');
    expect(steps[2]?.at).toBe('');
    // Pas encore remise : la dernière n'a pas d'heure non plus.
    expect(steps[3]?.at).toBe('');
  });

  it('date la remise dès qu’elle a eu lieu', () => {
    const handed = { ...ORDER, handedOverAt: '2026-09-07T05:58:00.000Z' } as OrderView;

    expect(trackedOf(handed, COPY).steps[3]?.at).not.toBe('');
  });

  /** Le QR n'est annoncé que si le jeton EXISTE — il n'est émis qu'en retrait. */
  it('n’annonce le QR que lorsqu’il a été émis', () => {
    expect(trackedOf(ORDER, COPY).pickupNote).toBe(COPY.qrReady);
    expect(trackedOf({ ...ORDER, handoverToken: null } as OrderView, COPY).pickupNote).toBe('');
  });

  /** Un client peut ne demander aucune tranche : c'est un choix, pas un trou. */
  it('dit l’absence de tranche plutôt que d’en inventer une', () => {
    const free = {
      ...ORDER,
      fulfillment: { window: { value: null, source: 'request' } },
    } as unknown as OrderView;

    expect(trackedOf(free, COPY).sub).toBe(COPY.noWindow);
    expect(historyRowOf(free, '', COPY).slot).toBe('');
  });

  it('distingue le retrait de la livraison une fois la commande servie', () => {
    const done = { ...ORDER, status: 'fulfilled' } as OrderView;

    expect(historyRowOf(done, '', COPY).status).toBe('done');
    expect(
      historyRowOf({ ...done, fulfillmentMethod: 'delivery' } as OrderView, '', COPY).status,
    ).toBe('delivered');
  });

  /** Le suivi ne montre que ce qui VIT : ni remis, ni annulé. */
  it('sort du suivi ce qui est remis ou annulé', () => {
    expect(isLive(ORDER)).toBe(true);
    expect(isLive({ ...ORDER, status: 'fulfilled' } as OrderView)).toBe(false);
    expect(isLive({ ...ORDER, status: 'cancelled' } as OrderView)).toBe(false);
  });
});
