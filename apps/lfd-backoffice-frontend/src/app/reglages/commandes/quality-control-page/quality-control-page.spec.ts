import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  QualityControlSettingsPayload,
  QualityControlSettingsView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { QualityControlSettingsService } from '../quality-control-settings.service';
import { QualityControlPage } from './quality-control-page';

/**
 * **Réglages › Commandes › Contrôle qualité** (Hugo, 2026-10-26) : deux cases,
 * fournil désactivé et colisage activé par défaut, appliquées tout de suite.
 */

const DEFAULTS: QualityControlSettingsView = {
  lineChecks: false,
  orderChecks: true,
  source: 'default',
};

class FakeSettings {
  readonly payloads: QualityControlSettingsPayload[] = [];
  refusal: unknown = null;

  constructor(private current: QualityControlSettingsView | Error) {}

  read(): Promise<QualityControlSettingsView> {
    return this.current instanceof Error
      ? Promise.reject(this.current)
      : Promise.resolve(this.current);
  }

  /** Comme la route : `204`, aucun corps. */
  update(payload: QualityControlSettingsPayload): Promise<void> {
    this.payloads.push(payload);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.current = { ...payload, source: 'explicit' };
    return Promise.resolve();
  }
}

async function mount(
  api: FakeSettings,
  permissions: readonly StaffPermission[] = ['lfc_order_settings:read', 'lfc_order_settings:write'],
): Promise<ComponentFixture<QualityControlPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [QualityControlPage],
    providers: [
      { provide: QualityControlSettingsService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(QualityControlPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<QualityControlPage>): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

function box(fixture: ComponentFixture<QualityControlPage>, marker: string): HTMLInputElement {
  const host = fixture.nativeElement as HTMLElement;
  const input = host.querySelector<HTMLInputElement>(`[${marker}] input[type="checkbox"]`);
  if (input === null) {
    throw new Error(`Pas de case [${marker}].`);
  }
  return input;
}

describe('QualityControlPage — Réglages › Commandes › Contrôle qualité', () => {
  it('montre le fournil désactivé et le colisage activé quand personne n’a rien réglé', async () => {
    const fixture = await mount(new FakeSettings(DEFAULTS));

    expect(box(fixture, 'data-line-checks').checked).toBe(false);
    expect(box(fixture, 'data-order-checks').checked).toBe(true);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Contrôle qualité au fournil');
    expect(text).toContain('Contrôle qualité au colisage');
    expect(text).toContain('le reste jusqu');
  });

  it('active le fournil d’un clic sans toucher au colisage, puis relit', async () => {
    const api = new FakeSettings(DEFAULTS);
    const fixture = await mount(api);

    box(fixture, 'data-line-checks').click();
    await settle(fixture);

    expect(api.payloads).toEqual([{ lineChecks: true, orderChecks: true }]);
    expect(box(fixture, 'data-line-checks').checked).toBe(true);
  });

  it('désactive le colisage d’un clic', async () => {
    const api = new FakeSettings(DEFAULTS);
    const fixture = await mount(api);

    box(fixture, 'data-order-checks').click();
    await settle(fixture);

    expect(api.payloads).toEqual([{ lineChecks: false, orderChecks: false }]);
    expect(box(fixture, 'data-order-checks').checked).toBe(false);
  });

  it('un refus se dit, et la case revient à l’état servi', async () => {
    const api = new FakeSettings(DEFAULTS);
    api.refusal = new HttpErrorResponse({ status: 403, error: { message: 'Accès refusé.' } });
    const fixture = await mount(api);

    box(fixture, 'data-line-checks').click();
    await settle(fixture);

    expect(box(fixture, 'data-line-checks').checked).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('fold-callout')).not.toBeNull();
  });

  it('se fige sans lfc_order_settings:write', async () => {
    const fixture = await mount(new FakeSettings(DEFAULTS), ['lfc_order_settings:read']);

    expect(box(fixture, 'data-line-checks').disabled).toBe(true);
    expect(box(fixture, 'data-order-checks').disabled).toBe(true);
  });

  it('dit l’échec de lecture par un état fold, sans case', async () => {
    const fixture = await mount(new FakeSettings(new Error('réseau')));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('fold-empty-state')).not.toBeNull();
    expect(host.querySelector('[data-line-checks]')).toBeNull();
  });
});
