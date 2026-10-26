import type { CustomerOrderView } from '@lfd/contracts';

import { historyRowOf, isFulfilled, isLive, trackedOf, type RowCopy } from './order-rows';

const COPY: RowCopy = {
  pickup: 'Retrait',
  delivery: 'Coursier',
  stepPlaced: 'Panier validé',
  stepBakery: 'Au fournil',
  stepReady: 'Prête',
  stepHandedPickup: 'Retirée',
  stepHandedDelivery: 'Livrée',
  stepPartlyHandedPickup: 'Retirée en partie',
  stepPartlyHandedDelivery: 'Livrée en partie',
  qrReady: 'Votre QR est prêt',
  noWindow: 'Aucune tranche demandée',
  before: 'avant',
  authorCustomer: 'passée par {name}',
  authorTeam: 'par l’équipe',
};

/** Une commande de retrait, telle que `GET /companies/:id/orders` la rend. */
const ORDER = {
  id: 'ord_1',
  orderNumber: 'CMD-0007',
  status: 'placed',
  paymentStatus: 'not_required',
  settlement: 'account',
  requestedDeliveryDate: '2026-09-07',
  fulfillmentMethod: 'pickup',
  deliveryAddress: null,
  pickupAddress: { label: 'Le Labo', ligne1: '', ligne2: '', codePostal: '', ville: '', pays: '' },
  fulfillment: { window: { value: { start: '07:00', end: '08:00' }, source: 'request' } },
  subtotalCents: 9_000,
  vatCents: 640,
  totalCents: 9_640,
  origin: 'self_service',
  placedAt: '2026-09-06T07:04:00.000Z',
  lines: [
    { sku: 'VIE-001', quantity: 4 },
    { sku: 'PAI-001', quantity: 3 },
  ],
  handoverToken: 'tok_1',
  confirmedAt: null,
  readyAt: null,
  handedOverAt: null,
  refundedCents: 0,
} as unknown as CustomerOrderView;

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

  /** Le régime vient du serveur (`settlement`), plus d'une recopie du critère (F5). */
  it('lit le régime de règlement calculé au serveur', () => {
    expect(historyRowOf(ORDER, '', COPY).payment).toBe('account');
    expect(historyRowOf({ ...ORDER, settlement: 'free' }, '', COPY).payment).toBe('account');
    expect(
      historyRowOf({ ...ORDER, paymentStatus: 'paid', settlement: 'paid' }, '', COPY).payment,
    ).toBe('card');
  });

  /**
   * Régression : « Réglée · CB » se lisait sur le régime, et une commande carte
   * jamais payée s'affichait réglée (plan commandes non réglées, 2026-10-09).
   */
  it('dit le VRAI règlement d’une commande carte : réglée, à régler, refusée', () => {
    const due = { ...ORDER, settlement: 'due' } as const;
    expect(historyRowOf({ ...due, paymentStatus: 'pending' }, '', COPY).payment).toBe('due');
    expect(historyRowOf({ ...due, paymentStatus: 'failed' }, '', COPY).payment).toBe('refused');
    expect(
      historyRowOf({ ...ORDER, paymentStatus: 'refunded', settlement: 'paid' }, '', COPY).payment,
    ).toBe('card');
  });

  /**
   * F5 (plan `bons-et-facture-concordants`) : un pro au compte ne lit que le
   * HT — total moins TVA figés ; la TVA et le TTC sont sur la facture du mois.
   */
  it('montre le HT d’une commande au compte, et le TTC des autres', () => {
    expect(historyRowOf(ORDER, '', COPY)).toMatchObject({ total: 90, pretax: true });
    expect(trackedOf(ORDER, COPY)).toMatchObject({ total: 90, pretax: true });
    for (const settlement of ['paid', 'due', 'free'] as const) {
      const other = { ...ORDER, settlement };
      expect(historyRowOf(other, '', COPY)).toMatchObject({ total: 96.4, pretax: false });
      expect(trackedOf(other, COPY)).toMatchObject({ total: 96.4, pretax: false });
    }
  });

  /** Lu sur `paymentStatus` et le cumul réussi, jamais sur le régime (lot R1). */
  it('dit « remboursée » en totalité, en partie, ou rien', () => {
    const card = { ...ORDER, paymentStatus: 'paid', settlement: 'paid' } as CustomerOrderView;
    expect(historyRowOf(card, '', COPY).refund).toEqual({ kind: 'none' });
    expect(historyRowOf({ ...card, refundedCents: 1_250 }, '', COPY).refund).toEqual({
      kind: 'partial',
      refundedCents: 1_250,
    });
    const refunded = { ...card, paymentStatus: 'refunded', refundedCents: 9_640 } as const;
    expect(historyRowOf(refunded, '', COPY)).toMatchObject({
      refund: { kind: 'full' },
      // Le régime ne bouge pas : elle a été réglée par carte, puis rendue.
      payment: 'card',
    });
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
    const handed = { ...ORDER, handedOverAt: '2026-09-07T05:58:00.000Z' } as CustomerOrderView;

    expect(trackedOf(handed, COPY).steps[3]?.at).not.toBe('');
  });

  /** Le QR n'est annoncé que si le jeton EXISTE — il n'est émis qu'en retrait. */
  it('n’annonce le QR que lorsqu’il a été émis', () => {
    expect(trackedOf(ORDER, COPY).pickupNote).toBe(COPY.qrReady);
    expect(trackedOf({ ...ORDER, handoverToken: null } as CustomerOrderView, COPY).pickupNote).toBe(
      '',
    );
  });

  /** Un client peut ne demander aucune tranche : c'est un choix, pas un trou. */
  it('dit l’absence de tranche plutôt que d’en inventer une', () => {
    const free = {
      ...ORDER,
      fulfillment: { window: { value: null, source: 'request' } },
    } as unknown as CustomerOrderView;

    expect(trackedOf(free, COPY).sub).toBe(COPY.noWindow);
    expect(historyRowOf(free, '', COPY).slot).toBe('');
  });

  it('distingue le retrait de la livraison une fois la commande servie', () => {
    const done = { ...ORDER, status: 'fulfilled' } as CustomerOrderView;

    expect(historyRowOf(done, '', COPY).status).toBe('done');
    expect(
      historyRowOf({ ...done, fulfillmentMethod: 'delivery' } as CustomerOrderView, '', COPY)
        .status,
    ).toBe('delivered');
  });

  /** Le suivi ne montre que ce qui VIT : ni remis, ni annulé. */
  it('sort du suivi ce qui est remis ou annulé', () => {
    expect(isLive(ORDER)).toBe(true);
    expect(isLive({ ...ORDER, status: 'fulfilled' } as CustomerOrderView)).toBe(false);
    expect(isLive({ ...ORDER, status: 'cancelled' } as CustomerOrderView)).toBe(false);
  });

  /**
   * Régression : une commande carte « À régler » avait sa carte de suivi et
   * son QR de retrait (constaté en production le 2026-10-09).
   */
  it('sort du suivi une commande carte non réglée, garde la réglée et celle au compte', () => {
    const card = { ...ORDER, settlement: 'paid' } as CustomerOrderView;

    expect(isLive({ ...card, paymentStatus: 'pending' })).toBe(false);
    expect(isLive({ ...card, paymentStatus: 'failed' })).toBe(false);
    expect(isLive({ ...card, paymentStatus: 'refunded' })).toBe(false);
    expect(isLive({ ...card, paymentStatus: 'paid' })).toBe(true);
    expect(isLive(ORDER)).toBe(true);
  });
});

/**
 * 🔴 **Régression : une commande dont le bac est fait reculait à l'écran.**
 *
 * `STEP_OF_STATUS` ne connaissait pas `ready` — le statut que le colisage au
 * fournil pose depuis le 2026-09-07. La table retombait donc sur son repli
 * `?? 0`, et le client voyait sa commande revenir à « panier validé » au moment
 * précis où elle avançait le plus. Rien ne pouvait l'attraper : un repli qui
 * couvre un cas réel ne se distingue pas d'un repli qui ne couvre rien.
 */
describe('les quatre étapes, datées par les faits du fournil', () => {
  it('place une commande COLISÉE à l’étape « prête », pas au départ', () => {
    const packed = {
      ...ORDER,
      status: 'ready',
      confirmedAt: '2026-09-06T18:00:00.000Z',
      readyAt: '2026-09-07T04:30:00.000Z',
    } as CustomerOrderView;

    expect(trackedOf(packed, COPY).at).toBe(2);
  });

  it('date « au fournil » par la CLÔTURE du plan, et « prête » par le colisage', () => {
    // Deux instants distincts, chacun constaté par celui qui l'observe. Les
    // dériver l'un de l'autre serait plus simple et faux : entre les deux, il y
    // a une nuit de fabrication.
    const packed = {
      ...ORDER,
      status: 'ready',
      confirmedAt: '2026-09-06T18:00:00.000Z',
      readyAt: '2026-09-07T04:30:00.000Z',
    } as CustomerOrderView;

    const steps = trackedOf(packed, COPY).steps;
    expect(steps[1]?.at).not.toBe('');
    expect(steps[2]?.at).not.toBe('');
    expect(steps[1]?.at).not.toBe(steps[2]?.at);
  });

  it('laisse VIDE une étape que le fournil n’a pas encore constatée', () => {
    // Le seul vide qui subsiste, et il dit quelque chose : l'étape est à venir.
    // Emprunter l'heure de la voisine ferait dire au suivi qu'un sac est fait.
    const steps = trackedOf(ORDER, COPY).steps;
    expect(steps[1]?.at).toBe('');
    expect(steps[2]?.at).toBe('');
    expect(steps[3]?.at).toBe('');
  });

  it('avance la barre avec l’étape, sans la calculer deux fois', () => {
    // 3 étapes sur 4 franchies = 75 %. Le pourcentage DÉRIVE de `at` : deux
    // sources se contrediraient le jour où une étape s'ajoute.
    const packed = { ...ORDER, status: 'ready' } as CustomerOrderView;
    expect(trackedOf(packed, COPY).percent).toBe(75);
  });
});

/**
 * 🔴 **Régression : le tableau annonçait « Prête » à qui venait de commander.**
 *
 * `statusOf` repliait sur `ready` tout ce qui n'était ni annulé, ni remis, ni
 * en route. C'était sans conséquence tant que rien ne faisait avancer une
 * commande au-delà de `placed` — « prête » et « passée » se confondaient. Le
 * fournil les a séparées, et le repli s'est mis à mentir au client sur la seule
 * chose qu'il vient vérifier.
 */
describe('le statut annoncé au client', () => {
  function statusFor(status: string): string {
    return historyRowOf({ ...ORDER, status } as CustomerOrderView, 'Les Tommeuses', COPY).status;
  }

  it('dit « reçue » d’une commande à peine passée', () => {
    expect(statusFor('placed')).toBe('received');
  });

  it('dit « au fournil » dès que le plan du soir l’a inscrite', () => {
    expect(statusFor('confirmed')).toBe('bakery');
  });

  it('ne dit « prête » QUE lorsque le bac est fait', () => {
    expect(statusFor('ready')).toBe('ready');
  });

  it('distingue la retirée de la livrée, sur le même statut serveur', () => {
    // Le domaine n'a qu'un `fulfilled` : c'est l'acheminement qui choisit le
    // mot, et le client ne lit jamais « retirée » sur une livraison.
    expect(statusFor('fulfilled')).toBe('done');
    const delivered = {
      ...ORDER,
      status: 'fulfilled',
      fulfillmentMethod: 'delivery',
    } as CustomerOrderView;
    expect(historyRowOf(delivered, 'Les Tommeuses', COPY).status).toBe('delivered');
  });

  it('garde l’annulation au-dessus de tout le reste', () => {
    expect(statusFor('cancelled')).toBe('cancelled');
  });
});

/**
 * 🔴 **Régression (plan E7 reliquat, L5c) : une commande en partie retirée se
 * lisait « Enregistrée ».** `partially_handed_over` n'avait de branche ni dans
 * `statusOf` ni dans la table des étapes : le suivi la remettait à « panier
 * validé » au moment où une partie venait d'arriver, et le signalement d'un
 * problème lui était refusé.
 */
describe('une commande en partie retirée', () => {
  const PARTLY = {
    ...ORDER,
    status: 'partially_handed_over',
    handedOverAt: '2026-09-07T07:30:00.000Z',
  } as CustomerOrderView;
  const PARTLY_DELIVERED = { ...PARTLY, fulfillmentMethod: 'delivery' } as CustomerOrderView;

  it('se dit « en partie retirée » ou « en partie livrée », jamais « reçue »', () => {
    expect(historyRowOf(PARTLY, '', COPY).status).toBe('partlyDone');
    expect(historyRowOf(PARTLY_DELIVERED, '', COPY).status).toBe('partlyDelivered');
  });

  it('reste suivie : le reste est à venir, et son QR sert encore', () => {
    expect(isLive(PARTLY)).toBe(true);
  });

  it('se suit à la dernière étape, EN COURS, sous son mot', () => {
    const tracked = trackedOf(PARTLY, COPY);
    expect(tracked.at).toBe(3);
    expect(tracked.steps[3]?.label).toBe('Retirée en partie');
    expect(trackedOf(PARTLY_DELIVERED, COPY).steps[3]?.label).toBe('Livrée en partie');
    // Ni pleine ni reculée : trois étapes et demie sur quatre.
    expect(tracked.percent).toBe(88);
  });

  it('peut être signalée — une partie est arrivée', () => {
    expect(isFulfilled(historyRowOf(PARTLY, '', COPY))).toBe(true);
    expect(isFulfilled(historyRowOf(PARTLY_DELIVERED, '', COPY))).toBe(true);
  });

  it('ne change rien à une commande retirée en entier', () => {
    const done = trackedOf({ ...ORDER, status: 'fulfilled' } as CustomerOrderView, COPY);
    expect(done.steps[3]?.label).toBe('Retirée');
    expect(done.percent).toBe(100);
  });
});

describe('le site et l’auteur d’une commande (plan des commandes des sites, C2)', () => {
  it('nomme le site d’une commande de site, et rien pour la société listée', () => {
    const ofSite = { ...ORDER, site: { companyId: 'co_site', name: 'Hôtel des Cimes' } };
    expect(historyRowOf(ofSite, 'Groupe', COPY).site).toBe('Hôtel des Cimes');
    expect(trackedOf(ofSite, COPY).site).toBe('Hôtel des Cimes');
    expect(historyRowOf({ ...ORDER, site: null }, 'Groupe', COPY).site).toBeNull();
    expect(trackedOf(ORDER, COPY).site).toBe('');
  });

  it('dit qui a passé la commande, le client ou l’équipe', () => {
    const byCustomer = { ...ORDER, author: { kind: 'customer' as const, name: 'Camille D.' } };
    expect(historyRowOf(byCustomer, '', COPY).author).toBe('passée par Camille D.');
    const byTeam = { ...ORDER, author: { kind: 'team' as const } };
    expect(historyRowOf(byTeam, '', COPY).author).toBe('par l’équipe');
  });

  it('ne fabrique aucun auteur quand la liste n’en porte pas (perso)', () => {
    expect(historyRowOf(ORDER, '', COPY).author).toBe('');
  });

  /** Plan remise retrait par clientèle, lot C : l'assiette dans l'unité du total. */
  it('rend l’assiette de la remise de retrait et les articles exclus, absente sinon', () => {
    expect(historyRowOf(ORDER, '', COPY).pickupDiscount).toBeUndefined();

    const excluding: CustomerOrderView = {
      ...ORDER,
      discountCents: 50,
      discountAdjustment: { mode: 'percent', bp: 1000 },
      pickupDiscountBase: {
        eligibleHtCents: 500,
        eligibleTtcCents: 528,
        excludedSkus: ['PAI-001'],
      },
      lines: [
        { ...ORDER.lines[0]!, productName: 'Croissant' },
        { ...ORDER.lines[1]!, productName: 'Tasse', pickupDiscountEligible: false },
      ],
    };
    expect(historyRowOf(excluding, '', COPY).pickupDiscount).toEqual({
      adjustment: { mode: 'percent', bp: 1000 },
      discountCents: 50,
      eligibleCents: 500,
      eligiblePretax: true,
      excludedNames: ['Tasse'],
    });
    expect(
      historyRowOf({ ...excluding, settlement: 'paid' }, '', COPY).pickupDiscount,
    ).toMatchObject({ eligibleCents: 528, eligiblePretax: false });
  });
});
