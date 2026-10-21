import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  OrderCutoffSettingsPatch,
  OrderCutoffSettingsView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';
import { SameDayPage } from './same-day-page';

/**
 * **Jour même** (Hugo, 2026-10-21 — `plan-une-seule-heure.md` §6) : le réglage
 * quitte l'écran de l'heure limite pour sa page, même droit, même effet. La
 * bascule dit son effet avant d'écrire.
 */

const CLOSED: OrderCutoffSettingsView = { sameDayAllowed: false, updatedAt: null, updatedBy: null };

class FakeSettings {
  readonly patches: OrderCutoffSettingsPatch[] = [];
  refusal: unknown = null;

  constructor(private current: OrderCutoffSettingsView | Error) {}

  read(): Promise<OrderCutoffSettingsView> {
    return this.current instanceof Error
      ? Promise.reject(this.current)
      : Promise.resolve(this.current);
  }

  /** Comme la route : `204`, aucun corps. */
  update(patch: OrderCutoffSettingsPatch): Promise<void> {
    this.patches.push(patch);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.current = {
      sameDayAllowed: patch.sameDayAllowed,
      updatedAt: '2026-10-21T08:00:00.000Z',
      updatedBy: 'Hugo',
    };
    return Promise.resolve();
  }
}

async function mount(
  api: FakeSettings,
  permissions: readonly StaffPermission[] = ['lfc_order_settings:read', 'lfc_order_settings:write'],
): Promise<ComponentFixture<SameDayPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SameDayPage],
    providers: [
      { provide: OrderCutoffSettingsService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(SameDayPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<SameDayPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('SameDayPage', () => {
  it('dit le jour même non autorisé par défaut, et rien de l’heure limite', async () => {
    const fixture = await mount(new FakeSettings(CLOSED));

    expect(text(fixture)).toContain('le premier jour proposé et accepté est demain');
    expect(text(fixture)).toContain('Non autorisées');
    expect(text(fixture)).not.toContain('Désactiver');
  });

  it('ouvre le jour même à la confirmation, relit, et dit l’auteur', async () => {
    const api = new FakeSettings(CLOSED);
    const fixture = await mount(api);

    expect(fixture.componentInstance['effect']()).toContain('pourra viser aujourd’hui');
    await fixture.componentInstance['toggle']();
    fixture.detectChanges();

    expect(api.patches).toEqual([{ sameDayAllowed: true }]);
    expect(text(fixture)).toContain('Autorisées');
    expect(text(fixture)).toContain('Ne plus autoriser');
    expect(text(fixture)).toContain('Dernier réglage par Hugo');
  });

  it('sans `lfc_order_settings:write`, montre l’état sans bascule', async () => {
    const fixture = await mount(new FakeSettings(CLOSED), ['lfc_order_settings:read']);

    expect(text(fixture)).toContain('Non autorisées');
    expect((fixture.nativeElement as HTMLElement).querySelector('fold-inline-confirm')).toBeNull();
  });

  it('dit un refus du serveur et garde l’état servi', async () => {
    const api = new FakeSettings(CLOSED);
    api.refusal = new Error('refusé');
    const fixture = await mount(api);

    await fixture.componentInstance['toggle']();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('fold-callout')).not.toBeNull();
    expect(text(fixture)).toContain('Non autorisées');
  });

  it('propose de réessayer quand la lecture échoue', async () => {
    const fixture = await mount(new FakeSettings(new Error('panne')));

    expect(text(fixture)).toContain('Impossible de charger le réglage du jour même');
  });
});
