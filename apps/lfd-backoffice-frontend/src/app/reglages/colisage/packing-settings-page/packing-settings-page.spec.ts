import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PackingSettingsPayload, PackingSettingsView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { PackingSettingsService } from '../../../production/packing-settings.service';
import { PackingSettingsPage } from './packing-settings-page';

/**
 * **Réglages › Colisage** (Hugo, 2026-10-25) : le partage d'une moitié de bac,
 * fermé par défaut, se bascule d'une case — appliquée tout de suite, puis relue.
 */

const DEFAULTS: PackingSettingsView = { halfSharing: false, source: 'default' };

class FakeSettings {
  readonly payloads: PackingSettingsPayload[] = [];
  refusal: unknown = null;

  constructor(private current: PackingSettingsView | Error) {}

  read(): Promise<PackingSettingsView> {
    return this.current instanceof Error
      ? Promise.reject(this.current)
      : Promise.resolve(this.current);
  }

  /** Comme la route : `204`, aucun corps. */
  update(payload: PackingSettingsPayload): Promise<void> {
    this.payloads.push(payload);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.current = { halfSharing: payload.halfSharing, source: 'explicit' };
    return Promise.resolve();
  }
}

async function mount(
  api: FakeSettings,
  permissions: readonly StaffPermission[] = ['delivery_settings:read', 'delivery_settings:write'],
): Promise<ComponentFixture<PackingSettingsPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PackingSettingsPage],
    providers: [
      { provide: PackingSettingsService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PackingSettingsPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<PackingSettingsPage>): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

function box(fixture: ComponentFixture<PackingSettingsPage>): HTMLInputElement {
  const host = fixture.nativeElement as HTMLElement;
  const input = host.querySelector<HTMLInputElement>('[data-half-sharing] input[type="checkbox"]');
  if (input === null) {
    throw new Error('Pas de case « Partager une moitié de bac ».');
  }
  return input;
}

describe('PackingSettingsPage — Réglages › Colisage', () => {
  it('montre le partage fermé quand personne n’a rien réglé', async () => {
    const fixture = await mount(new FakeSettings(DEFAULTS));
    expect(box(fixture).checked).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'les bacs déjà partagés restent tels quels',
    );
  });

  it('ouvre le partage d’un clic, puis relit', async () => {
    const api = new FakeSettings(DEFAULTS);
    const fixture = await mount(api);

    box(fixture).click();
    await settle(fixture);

    expect(api.payloads).toEqual([{ halfSharing: true }]);
    expect(box(fixture).checked).toBe(true);
  });

  it('un refus se dit, et la case revient à l’état servi', async () => {
    const api = new FakeSettings(DEFAULTS);
    api.refusal = new HttpErrorResponse({
      status: 403,
      error: { message: 'Accès refusé.' },
    });
    const fixture = await mount(api);

    box(fixture).click();
    await settle(fixture);

    expect(box(fixture).checked).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('fold-callout')).not.toBeNull();
  });

  it('se fige sans delivery_settings:write', async () => {
    const fixture = await mount(new FakeSettings(DEFAULTS), ['delivery_settings:read']);
    expect(box(fixture).disabled).toBe(true);
  });

  it('dit l’échec de lecture par un état fold, sans case', async () => {
    const fixture = await mount(new FakeSettings(new Error('réseau')));
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('fold-empty-state')).not.toBeNull();
    expect(host.querySelector('[data-half-sharing]')).toBeNull();
  });
});
