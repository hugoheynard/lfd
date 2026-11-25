import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CounterSettingsView, CounterSettingsPayload, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CounterSettingsService } from '../counter-settings.service';
import { CounterSettingsPage } from './counter-settings-page';

/**
 * **Réglages › Comptoir** (Hugo, 2026-11-19) : le suivi du stock, point par
 * point, désactivé par défaut ; une case par point, appliquée puis relue.
 */

const SETTINGS: CounterSettingsView = {
  sites: [
    {
      siteId: 'site_labo',
      siteLabel: 'Labo',
      stockTracking: false,
      immediateWithoutStock: false,
      updatedAt: null,
      updatedBy: null,
    },
    {
      siteId: 'site_village',
      siteLabel: 'Village',
      stockTracking: true,
      immediateWithoutStock: false,
      updatedAt: '2026-01-02T08:30:00.000Z',
      updatedBy: 'Lou',
    },
  ],
};

class FakeSettings {
  readonly puts: { siteId: string; payload: CounterSettingsPayload }[] = [];
  refusal: unknown = null;

  constructor(private current: CounterSettingsView | Error) {}

  read(): Promise<CounterSettingsView> {
    return this.current instanceof Error
      ? Promise.reject(this.current)
      : Promise.resolve(this.current);
  }

  /** Comme la route : `204`, aucun corps. */
  setSettings(siteId: string, payload: CounterSettingsPayload): Promise<void> {
    this.puts.push({ siteId, payload });
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    if (!(this.current instanceof Error)) {
      this.current = {
        sites: this.current.sites.map((site) =>
          site.siteId === siteId
            ? {
                ...site,
                stockTracking: payload.stockTracking,
                immediateWithoutStock: payload.immediateWithoutStock,
                updatedAt: '2026-01-03T09:00:00.000Z',
                updatedBy: 'Max',
              }
            : site,
        ),
      };
    }
    return Promise.resolve();
  }
}

async function mount(
  api: FakeSettings,
  permissions: readonly StaffPermission[] = ['lfc_order_settings:read', 'lfc_order_settings:write'],
): Promise<ComponentFixture<CounterSettingsPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CounterSettingsPage],
    providers: [
      { provide: CounterSettingsService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CounterSettingsPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<CounterSettingsPage>): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

function immediateBox(
  fixture: ComponentFixture<CounterSettingsPage>,
  siteId: string,
): HTMLInputElement {
  const host = fixture.nativeElement as HTMLElement;
  const input = host.querySelector<HTMLInputElement>(
    `[data-immediate-without-stock="${siteId}"] input[type="checkbox"]`,
  );
  if (input === null) {
    throw new Error(`Pas de case de retrait immédiat pour ${siteId}.`);
  }
  return input;
}

function box(fixture: ComponentFixture<CounterSettingsPage>, siteId: string): HTMLInputElement {
  const host = fixture.nativeElement as HTMLElement;
  const input = host.querySelector<HTMLInputElement>(
    `[data-stock-tracking="${siteId}"] input[type="checkbox"]`,
  );
  if (input === null) {
    throw new Error(`Pas de case pour ${siteId}.`);
  }
  return input;
}

const text = (fixture: ComponentFixture<CounterSettingsPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('CounterSettingsPage — Réglages › Comptoir', () => {
  it('liste les points, leur suivi et la dernière modification', async () => {
    const fixture = await mount(new FakeSettings(SETTINGS));
    expect(box(fixture, 'site_labo').checked).toBe(false);
    expect(box(fixture, 'site_village').checked).toBe(true);
    expect(text(fixture)).toContain('Jamais réglé : désactivé par défaut.');
    expect(text(fixture)).toContain('Modifié par Lou, le 2 janvier 2026');
    expect(text(fixture)).toContain('permet de déclarer une rupture');
  });

  it('active le suivi d’un point d’un clic, puis relit', async () => {
    const api = new FakeSettings(SETTINGS);
    const fixture = await mount(api);

    box(fixture, 'site_labo').click();
    await settle(fixture);

    expect(api.puts).toEqual([
      { siteId: 'site_labo', payload: { stockTracking: true, immediateWithoutStock: false } },
    ]);
    expect(box(fixture, 'site_labo').checked).toBe(true);
    expect(text(fixture)).toContain('Modifié par Max');
  });

  it('laisse le retrait immédiat passer sans le stock reçu, sans toucher au suivi', async () => {
    const api = new FakeSettings(SETTINGS);
    const fixture = await mount(api);

    immediateBox(fixture, 'site_village').click();
    await settle(fixture);

    expect(api.puts).toEqual([
      { siteId: 'site_village', payload: { stockTracking: true, immediateWithoutStock: true } },
    ]);
    expect(immediateBox(fixture, 'site_village').checked).toBe(true);
    expect(box(fixture, 'site_village').checked).toBe(true);
  });

  it('un refus se dit, et la case revient à l’état servi', async () => {
    const api = new FakeSettings(SETTINGS);
    api.refusal = new HttpErrorResponse({ status: 403, error: { message: 'Accès refusé.' } });
    const fixture = await mount(api);

    box(fixture, 'site_village').click();
    await settle(fixture);

    expect(box(fixture, 'site_village').checked).toBe(true);
    const callout = (fixture.nativeElement as HTMLElement).querySelector('fold-callout');
    expect(callout?.textContent).toContain('Accès refusé.');
  });

  it('se fige en lecture seule sans lfc_order_settings:write', async () => {
    const fixture = await mount(new FakeSettings(SETTINGS), ['lfc_order_settings:read']);
    expect(box(fixture, 'site_labo').disabled).toBe(true);
    expect(box(fixture, 'site_village').disabled).toBe(true);
  });

  it('dit l’échec de lecture par un état fold, sans case', async () => {
    const fixture = await mount(new FakeSettings(new Error('réseau')));
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('fold-empty-state')).not.toBeNull();
    expect(host.querySelector('[data-stock-tracking]')).toBeNull();
  });

  it('sans point, invite à en créer un', async () => {
    const fixture = await mount(new FakeSettings({ sites: [] }));
    expect(text(fixture)).toContain('Aucun point de retrait');
  });
});
