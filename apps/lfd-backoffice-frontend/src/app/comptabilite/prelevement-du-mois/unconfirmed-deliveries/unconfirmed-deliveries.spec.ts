import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { UnconfirmedDeliveriesView, UnconfirmedDeliveryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { UnconfirmedDeliveriesService } from '../../unconfirmed-deliveries.service';
import { UnconfirmedDeliveries } from './unconfirmed-deliveries';

/** Des jours seulement affichés : aucun n'est comparé à l'horloge. */
const WAITING: UnconfirmedDeliveryView = {
  orderId: 'o_1',
  orderNumber: 'CMD-001',
  companyId: 'c_port',
  companyName: 'Boulangerie du Port',
  serviceDay: '2030-03-12',
  fulfillmentMethod: 'delivery',
  totalCents: 10_550,
};

async function boot(
  list: () => Promise<UnconfirmedDeliveriesView>,
): Promise<ComponentFixture<UnconfirmedDeliveries>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: UnconfirmedDeliveriesService,
        useValue: { list } satisfies Pick<UnconfirmedDeliveriesService, 'list'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(UnconfirmedDeliveries);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const element = (fixture: ComponentFixture<UnconfirmedDeliveries>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('UnconfirmedDeliveries', () => {
  it('ne rend rien quand aucun bon n’attend', async () => {
    const fixture = await boot(() => Promise.resolve({ before: '2030-03-13', orders: [] }));
    expect(element(fixture).querySelector('[data-unconfirmed]')).toBeNull();
  });

  it('nomme le bon, le client, le jour prévu et le geste de sortie', async () => {
    const fixture = await boot(() => Promise.resolve({ before: '2030-03-13', orders: [WAITING] }));
    const text = element(fixture).querySelector('[data-unconfirmed]')?.textContent ?? '';

    expect(text).toContain('CMD-001');
    expect(text).toContain('Boulangerie du Port');
    expect(text).toContain('Livraison');
    expect(text).toContain('enregistrer leur retrait ou leur livraison');
  });

  it('dit l’échec de lecture au lieu d’une liste vide qui mentirait', async () => {
    const fixture = await boot(() => Promise.reject(new Error('réseau')));
    expect(element(fixture).querySelector('[data-unconfirmed-error]')).not.toBeNull();
    expect(element(fixture).querySelector('[data-unconfirmed]')).toBeNull();
  });
});
