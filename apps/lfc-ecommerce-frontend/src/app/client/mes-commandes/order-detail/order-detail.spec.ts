import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FR } from '../../copy/fr';
import { ROWS } from '../order-rows.fixture';
import { OrderDetail } from './order-detail';

describe('OrderDetail', () => {
  let fixture: ComponentFixture<OrderDetail>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const stars = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('button.star'));

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OrderDetail] });
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

  it('offre les trois poids du système, jamais trois fois le même', () => {
    const buttons = Array.from(el().querySelectorAll('button[foldButton]'));
    expect(buttons.map((b) => b.getAttribute('emphasis'))).toEqual([null, 'soft', 'outline']);
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

  it('remonte le signalement sans choisir la surface qui l’accueille', () => {
    let raised = 0;
    fixture.componentInstance.problemRaised.subscribe(() => (raised += 1));
    el().querySelector<HTMLButtonElement>('button[intent="danger"]')?.click();
    expect(raised).toBe(1);
  });

  /** Plan des points, E2.3 : la part HT du bon, seulement quand il y en a une. */
  it('montre la ligne « Bon de fidélité (HT) » seulement quand un bon a été imputé', () => {
    expect(el().textContent).not.toContain(FR.cart.voucherHtLine);

    fixture.componentRef.setInput('order', ROWS[1]);
    fixture.detectChanges();
    expect(el().textContent).toContain(FR.cart.voucherHtLine);
  });
});
