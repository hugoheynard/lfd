import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FR } from '../../copy/fr';
import { MOCK_HISTORY } from '../../mock-orders';
import { OrderDetail } from './order-detail';

describe('OrderDetail', () => {
  let fixture: ComponentFixture<OrderDetail>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const stars = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('button.star'));

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OrderDetail] });
    fixture = TestBed.createComponent(OrderDetail);
    fixture.componentRef.setInput('order', MOCK_HISTORY[0]);
    fixture.detectChanges();
  });

  it('dit OÙ le règlement tombe, pas seulement son état', () => {
    // C'est le lien explicite avec le relevé.
    expect(el().textContent).toContain(FR.orders.payAccountNote);
  });

  it('n’annonce l’origine que lorsqu’il y en a une', () => {
    expect(el().textContent).not.toContain(FR.orders.detailOrigin);

    fixture.componentRef.setInput('order', MOCK_HISTORY[4]);
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

  it('remonte le signalement sans choisir la surface qui l’accueille', () => {
    let raised = 0;
    fixture.componentInstance.problemRaised.subscribe(() => (raised += 1));
    el().querySelector<HTMLButtonElement>('button[intent="danger"]')?.click();
    expect(raised).toBe(1);
  });
});
