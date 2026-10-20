import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DeliveryAddressView, DeliveryZoneView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryZonesService } from '../../b2b/reglages/delivery-zones.service';
import { UncoveredDeliveryAddresses } from './uncovered-delivery-addresses';

/**
 * **L'adresse de livraison hors zone, vue du commercial** (2026-10-20) : le
 * rapprochement est celui du serveur (préfixe), et le lien mène au réglage
 * des zones, prérempli.
 */

const TARENTAISE: DeliveryZoneView = {
  id: 'zone_1',
  postalPrefixes: ['731'],
  label: 'Tarentaise',
  fee: { mode: 'amount', cents: 1_500 },
};

function address(id: string, codePostal: string, ville: string, label = ''): DeliveryAddressView {
  return {
    id,
    label,
    ligne1: `${id} rue du Lac`,
    ligne2: '',
    codePostal,
    ville,
    pays: 'France',
    isDefault: false,
    specs: {
      note: '',
      slotList: { mode: 'everyday', slots: [] },
      deliveryContact: null,
      gps: null,
      signatureRequired: false,
    },
    procedureStepCount: 0,
    depositAllowed: false,
  };
}

async function mount(
  deliveries: readonly DeliveryAddressView[],
  zones: () => Promise<readonly DeliveryZoneView[]>,
  granted: readonly StaffPermission[] = ['delivery_fee:write'],
): Promise<ComponentFixture<UncoveredDeliveryAddresses>> {
  TestBed.configureTestingModule({
    imports: [UncoveredDeliveryAddresses],
    providers: [
      provideRouter([]),
      { provide: DeliveryZonesService, useValue: { list: zones } },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
  const fixture = TestBed.createComponent(UncoveredDeliveryAddresses);
  fixture.componentRef.setInput('deliveries', deliveries);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<UncoveredDeliveryAddresses>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('UncoveredDeliveryAddresses', () => {
  it('se tait quand un préfixe de zone couvre l’adresse', async () => {
    const fixture = await mount([address('a', '73150', "Val d'Isère")], () =>
      Promise.resolve([TARENTAISE]),
    );

    expect(host(fixture).querySelector('fold-callout')).toBeNull();
  });

  it('avertit pour l’adresse hors zone, avec un lien prérempli', async () => {
    const fixture = await mount(
      [address('a', '73150', "Val d'Isère"), address('b', '73320', 'Tignes', 'Chalet')],
      () => Promise.resolve([{ ...TARENTAISE, postalPrefixes: ['73150'] }]),
    );

    expect(host(fixture).querySelectorAll('fold-callout')).toHaveLength(1);
    expect(host(fixture).textContent).toContain('Chalet');
    expect(host(fixture).textContent).toContain('73320 Tignes');
    expect(host(fixture).querySelector('a')?.getAttribute('href')).toBe(
      '/reglages/livraison/zones?addPostalCode=73320',
    );
  });

  it('sans le droit de régler les frais, avertit sans proposer le lien', async () => {
    const fixture = await mount([address('b', '73320', 'Tignes')], () => Promise.resolve([]), []);

    expect(host(fixture).querySelector('fold-callout')).not.toBeNull();
    expect(host(fixture).querySelector('a')).toBeNull();
  });

  it('ne dit rien quand les zones n’ont pas pu être lues', async () => {
    const fixture = await mount([address('b', '73320', 'Tignes')], () =>
      Promise.reject(new Error('503')),
    );

    expect(host(fixture).querySelector('fold-callout')).toBeNull();
  });
});
