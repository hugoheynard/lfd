import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PackingSettingsPayload, PackingSettingsView, StaffPermission } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { PackingSettingsService } from '../../../production/packing-settings.service';
import { PackingPickupLevelCard } from './packing-pickup-level-card';

/**
 * « Colisage — retrait » : la carte lit et écrit le réglage du colisage par sa
 * route, renvoie le partage d'une moitié tel que servi, et se fige sans
 * `delivery_settings:write`.
 */

const SERVED: PackingSettingsView = {
  halfSharing: true,
  showMadeToOrder: true,
  pickupTrackingLevel: 'simple',
  source: 'explicit',
};

class FakePackingSettings {
  view: PackingSettingsView = SERVED;
  failRead = false;
  refuse = false;
  readonly updates: PackingSettingsPayload[] = [];

  read(): Promise<PackingSettingsView> {
    return this.failRead ? Promise.reject(new Error('lecture')) : Promise.resolve(this.view);
  }

  update(payload: PackingSettingsPayload): Promise<void> {
    if (this.refuse) {
      return Promise.reject(new Error('refus'));
    }
    this.updates.push(payload);
    this.view = {
      halfSharing: payload.halfSharing,
      showMadeToOrder: payload.showMadeToOrder ?? this.view.showMadeToOrder,
      pickupTrackingLevel: payload.pickupTrackingLevel ?? this.view.pickupTrackingLevel,
      source: 'explicit',
    };
    return Promise.resolve();
  }
}

let service: FakePackingSettings;

async function mount(
  granted: readonly StaffPermission[] = ['delivery_settings:read', 'delivery_settings:write'],
): Promise<{ fixture: ComponentFixture<PackingPickupLevelCard>; card: PackingPickupLevelCard }> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PackingSettingsService, useValue: service },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => granted.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PackingPickupLevelCard);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return { fixture, card: fixture.componentInstance };
}

const root = (fixture: ComponentFixture<PackingPickupLevelCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('la carte « Colisage — retrait »', () => {
  beforeEach(() => {
    service = new FakePackingSettings();
  });

  it('pose le niveau détaillé en renvoyant le partage tel que servi, puis relit', async () => {
    const { card } = await mount();

    await card['choose']('detailed');

    expect(service.updates).toEqual([{ halfSharing: true, pickupTrackingLevel: 'detailed' }]);
    expect(card['level']()).toBe('detailed');
  });

  it('le niveau déjà servi ne part pas', async () => {
    const { card } = await mount();

    await card['choose']('simple');

    expect(service.updates).toEqual([]);
  });

  it('un refus garde le niveau servi et dit pourquoi', async () => {
    service.refuse = true;
    const { fixture, card } = await mount();

    await card['choose']('detailed');
    fixture.detectChanges();

    expect(card['level']()).toBe('simple');
    expect(root(fixture).querySelector('[data-packing-refused]')).not.toBeNull();
  });

  it('sans droit d’écriture, le niveau se lit sans sélecteur ni envoi', async () => {
    const { fixture, card } = await mount(['delivery_settings:read']);

    await card['choose']('detailed');

    expect(service.updates).toEqual([]);
    expect(root(fixture).querySelector('fold-view-toggle')).toBeNull();
    expect(root(fixture).querySelector('[data-packing-level-read]')?.textContent).toContain(
      'Simple',
    );
  });

  it('une lecture échouée le dit, sans sélecteur', async () => {
    service.failRead = true;
    const { fixture } = await mount();

    expect(root(fixture).querySelector('[data-packing-lost]')).not.toBeNull();
    expect(root(fixture).querySelector('fold-view-toggle')).toBeNull();
  });
});
