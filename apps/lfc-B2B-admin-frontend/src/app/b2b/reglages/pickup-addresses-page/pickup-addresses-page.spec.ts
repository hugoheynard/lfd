import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PickupAddressesService } from '../pickup-addresses.service';
import { PickupAddressesPage } from './pickup-addresses-page';

/**
 * **La page des points de retrait.** Ce qu'elle tient de neuf : la remise d'un
 * point se lit avec sa clientèle, faute de quoi une remise réservée aux pros
 * se lirait comme offerte à tous.
 */

const LABO: PickupAddressView = {
  id: 'pick_1',
  label: 'Labo',
  ligne1: '3 rue du Four',
  ligne2: '',
  codePostal: '75011',
  ville: 'Paris',
  pays: 'France',
  isDefault: true,
  discount: { mode: 'amount', cents: 800 },
  discountAudiences: { b2b: true, b2c: false },
  opening: { publicOpening: null, proPickup: null },
};

async function mount(
  points: readonly PickupAddressView[] | Error,
): Promise<ComponentFixture<PickupAddressesPage>> {
  TestBed.configureTestingModule({
    imports: [PickupAddressesPage],
    providers: [
      // La liste NAVIGUE vers la page d'un point depuis le 2026-09-16 : sans
      // routeur, l'injection échoue avant le premier rendu.
      provideRouter([]),
      {
        provide: PickupAddressesService,
        useValue: {
          list: () => (points instanceof Error ? Promise.reject(points) : Promise.resolve(points)),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PickupAddressesPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('PickupAddressesPage', () => {
  it('dit la remise AVEC sa clientèle', async () => {
    const fixture = await mount([LABO]);

    expect(fixture.componentInstance['discountLabel'](LABO)).toMatch(/^− .+ · B2B$/);
  });

  it('ne dit pas de clientèle quand la remise vise les deux', async () => {
    const both = { ...LABO, discountAudiences: { b2b: true, b2c: true } };
    const fixture = await mount([both]);

    expect(fixture.componentInstance['discountLabel'](both)).not.toContain('·');
  });

  it('dit l’absence de point par un état vide fold', async () => {
    const fixture = await mount([]);

    expect(fixture.nativeElement.textContent).toContain('Aucun point de retrait');
  });

  it('dit l’échec de chargement par un état d’erreur fold', async () => {
    const fixture = await mount(new Error('réseau'));

    expect(fixture.nativeElement.textContent).toContain(
      'Impossible de charger les points de retrait',
    );
  });
});
