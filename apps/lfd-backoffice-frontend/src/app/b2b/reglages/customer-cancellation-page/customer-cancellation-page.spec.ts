import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CustomerCancellationSettingsPatch,
  CustomerCancellationSettingsView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CustomerCancellationService } from '../customer-cancellation.service';
import { CustomerCancellationPage } from './customer-cancellation-page';

/**
 * **Réglages › Commandes** (C6.5) : un interrupteur, un délai visible quand il
 * est ouvert, et seules les clés changées partent au serveur.
 */

const CLOSED: CustomerCancellationSettingsView = {
  openToB2c: false,
  hoursBefore: 24,
  updatedAt: null,
  updatedBy: null,
};

class FakeSettings {
  readonly patches: CustomerCancellationSettingsPatch[] = [];
  refusal: unknown = null;

  constructor(private current: CustomerCancellationSettingsView | Error) {}

  read(): Promise<CustomerCancellationSettingsView> {
    return this.current instanceof Error
      ? Promise.reject(this.current)
      : Promise.resolve(this.current);
  }

  /** Comme la route : `204`, aucun corps. */
  update(patch: CustomerCancellationSettingsPatch): Promise<void> {
    this.patches.push(patch);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    const base = this.current instanceof Error ? CLOSED : this.current;
    this.current = {
      openToB2c: patch.openToB2c ?? base.openToB2c,
      hoursBefore: patch.hoursBefore ?? base.hoursBefore,
      updatedAt: '2026-10-13T08:00:00.000Z',
      updatedBy: 'Hugo',
    };
    return Promise.resolve();
  }
}

async function mount(
  api: FakeSettings,
  permissions: readonly StaffPermission[] = ['b2b_settings:read', 'b2b_settings:write'],
): Promise<ComponentFixture<CustomerCancellationPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CustomerCancellationPage],
    providers: [
      { provide: CustomerCancellationService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CustomerCancellationPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<CustomerCancellationPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('CustomerCancellationPage', () => {
  it('fermé : pas de délai à l’écran, et le rappel des pros', async () => {
    const fixture = await mount(new FakeSettings(CLOSED));
    const host = fixture.nativeElement as HTMLElement;

    expect(text(fixture)).toContain('Les particuliers peuvent annuler eux-mêmes');
    expect(host.querySelector('fold-number-input')).toBeNull();
    expect(text(fixture)).toContain('Les pros annulent jusqu');
    expect(text(fixture)).not.toContain('Dernier réglage');
  });

  it('ouvert : le délai et sa phrase, avec qui a réglé', async () => {
    const fixture = await mount(
      new FakeSettings({
        openToB2c: true,
        hoursBefore: 48,
        updatedAt: '2026-10-12T08:00:00.000Z',
        updatedBy: 'Cécile Martin',
      }),
    );

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('fold-number-input'),
    ).not.toBeNull();
    expect(text(fixture)).toContain("Jusqu'à 48 h avant le début du créneau");
    expect(text(fixture)).toContain('sans heure de début, avant minuit du jour');
    expect(text(fixture)).toContain('Dernier réglage par Cécile Martin, le');
  });

  it('🔴 sans `b2b_settings:write`, aucun bouton d’écriture', async () => {
    const fixture = await mount(new FakeSettings(CLOSED), ['b2b_settings:read']);

    expect((fixture.nativeElement as HTMLElement).querySelector('button')).toBeNull();
  });

  it('n’envoie que ce qui a changé, puis relit', async () => {
    const api = new FakeSettings(CLOSED);
    const fixture = await mount(api);
    const page = fixture.componentInstance;

    expect(page['patch']()).toBeNull();
    page['open'].set(true);
    await page['save']();

    expect(api.patches).toEqual([{ openToB2c: true }]);
    expect(page['settings']()?.openToB2c).toBe(true);
    expect(page['patch']()).toBeNull();

    page['hours'].set(12);
    await page['save']();
    expect(api.patches[1]).toEqual({ hoursBefore: 12 });
  });

  it('un délai vidé ne s’enregistre pas', async () => {
    const fixture = await mount(new FakeSettings({ ...CLOSED, openToB2c: true }));
    const page = fixture.componentInstance;

    page['hours'].set(null);

    expect(page['canSave']()).toBe(false);
  });

  it('dit un refus du serveur et garde le brouillon', async () => {
    const api = new FakeSettings(CLOSED);
    api.refusal = new Error('refusé');
    const fixture = await mount(api);
    const page = fixture.componentInstance;

    page['open'].set(true);
    await page['save']();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('fold-callout')).not.toBeNull();
    expect(page['open']()).toBe(true);
    expect(page['settings']()?.openToB2c).toBe(false);
  });

  it('propose de réessayer quand la lecture échoue', async () => {
    const fixture = await mount(new FakeSettings(new Error('panne')));

    expect(text(fixture)).toContain('Impossible de charger le réglage des commandes');
  });
});
