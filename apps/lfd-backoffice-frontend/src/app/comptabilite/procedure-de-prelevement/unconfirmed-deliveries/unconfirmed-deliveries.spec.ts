import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { UnconfirmedDeliveryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { UnconfirmedDeliveries } from './unconfirmed-deliveries';

/** Des jours seulement affichés : aucun n'est comparé à l'horloge. */
const WAITING: UnconfirmedDeliveryView = {
  orderId: 'o_1',
  orderNumber: 'ORD-001',
  companyId: 'c_port',
  companyName: 'Boulangerie du Port',
  serviceDay: '2030-03-12',
  fulfillmentMethod: 'delivery',
  totalCents: 10_550,
};

function boot(orders: readonly UnconfirmedDeliveryView[]): ComponentFixture<UnconfirmedDeliveries> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(UnconfirmedDeliveries);
  fixture.componentRef.setInput('orders', orders);
  fixture.detectChanges();
  return fixture;
}

const element = (fixture: ComponentFixture<UnconfirmedDeliveries>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('UnconfirmedDeliveries', () => {
  it('ne rend rien quand aucun bon n’attend', () => {
    expect(element(boot([])).querySelector('[data-unconfirmed]')).toBeNull();
  });

  it('nomme le bon, le client, le jour prévu, ce qui manque et le geste de sortie', () => {
    const fixture = boot([WAITING]);
    const text = element(fixture).querySelector('[data-unconfirmed]')?.textContent ?? '';

    expect(text).toContain('ORD-001');
    expect(text).toContain('Boulangerie du Port');
    expect(text).toContain('Livraison non constatée');
    expect(text).toContain('enregistrer leur retrait ou leur livraison');
    expect(element(fixture).querySelector('[data-confirm-order="o_1"]')?.getAttribute('href')).toBe(
      '/commandes/o_1',
    );
  });
});
