import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderCutoffsService } from '../order-cutoffs.service';
import { PickupAddressesService } from '../pickup-addresses.service';
import { OrderCutoffsPage } from './order-cutoffs-page';

/**
 * **La page des heures limites.** Séparée de celle des points, elle lit
 * elle-même les points dont le panneau d'une règle a besoin pour sa portée —
 * et ne monte la section qu'une fois ces points connus.
 */
async function mount(
  points: readonly PickupAddressView[] | Error,
): Promise<ComponentFixture<OrderCutoffsPage>> {
  TestBed.configureTestingModule({
    imports: [OrderCutoffsPage],
    providers: [
      {
        provide: PickupAddressesService,
        useValue: {
          list: () => (points instanceof Error ? Promise.reject(points) : Promise.resolve(points)),
        },
      },
      { provide: OrderCutoffsService, useValue: { list: () => Promise.resolve([]) } },
    ],
  });
  const fixture = TestBed.createComponent(OrderCutoffsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('OrderCutoffsPage', () => {
  it('monte la section des heures limites une fois les points lus', async () => {
    const fixture = await mount([]);

    expect(fixture.nativeElement.querySelector('app-cutoffs-section')).not.toBeNull();
  });

  it('dit l’échec de lecture des points par fold, sans monter la section', async () => {
    const fixture = await mount(new Error('réseau'));

    expect(fixture.nativeElement.querySelector('app-cutoffs-section')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'Impossible de charger les points de retrait',
    );
  });
});
