import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FR } from '../../copy/fr';
import { OrderCancellationGateway } from '../../order-cancellation/order-cancellation.gateway';
import { OrderRevisionGateway } from '../../order-revision/order-revision.gateway';
import { ROWS } from '../order-rows.fixture';
import { OrderDetail } from './order-detail';

describe('OrderDetail', () => {
  let fixture: ComponentFixture<OrderDetail>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const stars = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('button.star'));

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderDetail],
      providers: [
        provideRouter([]),
        // L'annulation se relit au serveur : ses cas ont leur propre spec.
        {
          provide: OrderCancellationGateway,
          useValue: { cancellability: () => Promise.resolve(null) },
        },
        // La modification aussi (plan de modification, §6).
        {
          provide: OrderRevisionGateway,
          useValue: {
            order: () => Promise.resolve(null),
            changeRequest: () => Promise.resolve(null),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(OrderDetail);
    fixture.componentRef.setInput('order', ROWS[0]);
    fixture.detectChanges();
  });

  it('dit OÙ le règlement tombe, pas seulement son état', () => {
    // C'est le lien explicite avec le relevé.
    expect(el().textContent).toContain(FR.orders.payAccountNote);
  });

  it('ne parle de remboursement que lorsqu’il y en a un', () => {
    expect(el().querySelector('[data-refund]')).toBeNull();

    fixture.componentRef.setInput('order', ROWS[1]);
    fixture.detectChanges();
    expect(el().querySelector('[data-refund]')?.textContent).toContain('Remboursée en partie');
    expect(el().querySelector('[data-refund]')?.textContent).toContain('12,50');

    fixture.componentRef.setInput('order', { ...ROWS[0], refund: { kind: 'full' } });
    fixture.detectChanges();
    expect(el().querySelector('[data-refund]')?.textContent?.trim()).toBe(FR.orders.refundedFull);
  });

  it('n’annonce l’origine que lorsqu’il y en a une', () => {
    expect(el().textContent).not.toContain(FR.orders.detailOrigin);

    fixture.componentRef.setInput('order', ROWS[1]);
    fixture.detectChanges();
    expect(el().textContent).toContain(FR.orders.detailOrigin);
  });

  it('dit « À régler » et offre « Régler » vers la page de règlement de la MÊME commande', () => {
    const settle = (): HTMLAnchorElement | null => el().querySelector('a[foldButton]');
    expect(settle()).toBeNull();

    fixture.componentRef.setInput('order', { ...ROWS[0], payment: 'due' });
    fixture.detectChanges();
    expect(el().textContent).toContain(FR.orders.payDue);
    expect(settle()?.getAttribute('href')).toBe(`/reglement/${ROWS[0]?.id ?? ''}`);

    fixture.componentRef.setInput('order', { ...ROWS[0], payment: 'refused' });
    fixture.detectChanges();
    expect(el().textContent).toContain(FR.orders.payRefused);
    expect(settle()?.textContent?.trim()).toBe(FR.orders.settle);
  });

  it('offre les trois poids du système, jamais trois fois le même', () => {
    // Commande remise : les deux documents (bon de commande, bon de livraison
    // — plan E5a) partagent le poids plein de « ce qu'on vient chercher ».
    const buttons = Array.from(el().querySelectorAll('button[foldButton]'));
    expect(buttons.map((b) => b.getAttribute('emphasis'))).toEqual([null, null, 'soft', 'outline']);
    expect(buttons.at(-1)?.getAttribute('intent')).toBe('danger');
  });

  it('ne DÉCIDE pas de la note : il la reçoit et la remonte', () => {
    // Elle vit dans la table, qui survit à la fermeture du tiroir — un
    // composant détruit à chaque repli emporterait l'étoile qu'on vient de
    // donner.
    const given: number[] = [];
    fixture.componentInstance.rated.subscribe((value) => given.push(value));
    stars()[3]?.click();
    expect(given).toEqual([4]);
    // Rien n'a bougé à l'écran : c'est le parent qui rendra la note.
    expect(el().querySelector('.rate-label')?.textContent).toContain(FR.orders.rateIdle);

    fixture.componentRef.setInput('rate', 4);
    fixture.detectChanges();
    expect(el().querySelector('.rate-label')?.textContent).toContain(FR.orders.rateHigh);
  });

  it('remonte la demande de bon de commande — le bouton ne faisait RIEN', () => {
    // 🔴 Régression du 2026-09-07 : ce bouton portait `icon="download"` et aucun
    // `(click)`. Un attribut manquant sur un bouton ne lève rien, ne casse aucun
    // typecheck et ne rougit dans aucun test — il ne se voit qu'en cliquant.
    // C'est la même famille de trou que `qrAsked`, émis et écouté par personne.
    let asked = 0;
    fixture.componentInstance.purchaseOrderRequested.subscribe(() => (asked += 1));

    el().querySelector<HTMLButtonElement>('button[icon="download"]')?.click();

    expect(asked).toBe(1);
  });

  it('remonte la demande de bon de livraison sur une commande remise (plan E5a)', () => {
    let asked = 0;
    fixture.componentInstance.deliveryNoteRequested.subscribe(() => (asked += 1));

    el().querySelector<HTMLButtonElement>('button[data-delivery-note]')?.click();

    expect(asked).toBe(1);
  });

  it.each(['received', 'bakery', 'ready', 'route', 'cancelled'] as const)(
    'ne propose pas le bon de livraison sur une commande %s : rien n’a été remis',
    (status) => {
      fixture.componentRef.setInput('order', { ...ROWS[0]!, status });
      fixture.detectChanges();
      expect(el().querySelector('button[data-delivery-note]')).toBeNull();
    },
  );

  it('remonte le signalement sans choisir la surface qui l’accueille', () => {
    let raised = 0;
    fixture.componentInstance.problemRaised.subscribe(() => (raised += 1));
    el().querySelector<HTMLButtonElement>('button[intent="danger"]')?.click();
    expect(raised).toBe(1);
  });

  /** Plan « demandes clients », §6.6 : rien à signaler avant le retrait ou la livraison. */
  it.each(['received', 'bakery', 'ready', 'route', 'cancelled'] as const)(
    'ne propose pas « Signaler un problème » sur une commande %s',
    (status) => {
      fixture.componentRef.setInput('order', { ...ROWS[0]!, status });
      fixture.detectChanges();
      expect(el().querySelector('button[intent="danger"]')).toBeNull();
    },
  );

  it('le propose sur une commande livrée', () => {
    fixture.componentRef.setInput('order', { ...ROWS[0]!, status: 'delivered' });
    fixture.detectChanges();
    expect(el().querySelector('button[intent="danger"]')).not.toBeNull();
  });

  /** Plan des points, E2.3 : la part HT du bon, seulement quand il y en a une. */
  it('montre la ligne « Bon de fidélité (HT) » seulement quand un bon a été imputé', () => {
    expect(el().textContent).not.toContain(FR.cart.voucherHtLine);

    fixture.componentRef.setInput('order', ROWS[1]);
    fixture.detectChanges();
    expect(el().textContent).toContain(FR.cart.voucherHtLine);
  });

  /** Plan remise retrait par clientèle, lot C : l'assiette et les articles hors remise. */
  it('dit l’assiette de la remise de retrait et ce qu’elle ne couvrait pas', () => {
    expect(el().querySelector('[data-pickup-discount]')).toBeNull();

    fixture.componentRef.setInput('order', {
      ...ROWS[0]!,
      pickupDiscount: {
        adjustment: { mode: 'percent', bp: 1000 },
        discountCents: 50,
        eligibleCents: 528,
        eligiblePretax: false,
        excludedNames: ['Tasse', 'Torchon'],
      },
    });
    fixture.detectChanges();
    const text = (selector: string): string =>
      el().querySelector(selector)?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
    expect(text('[data-pickup-discount] dd')).toBe('−10 % sur 5,28 € TTC éligibles');
    expect(text('[data-pickup-excluded] dd')).toBe('Tasse, Torchon');
  });
});
