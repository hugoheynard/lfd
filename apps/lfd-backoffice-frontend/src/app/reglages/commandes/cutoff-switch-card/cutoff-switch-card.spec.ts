import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  OrderCutoffSettingsPatch,
  OrderCutoffSettingsView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';
import { CutoffSwitchCard } from './cutoff-switch-card';

/**
 * **L'interrupteur de l'heure limite générale** (lot O3,
 * `plan-reglages-commandes.md` §8.1) : la bascule dit son effet avant
 * d'écrire, et l'état servi remonte à la page.
 */

const ENABLED: OrderCutoffSettingsView = {
  enabled: true,
  sameDayAllowed: false,
  updatedAt: null,
  updatedBy: null,
};

class FakeSwitch {
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
    const base = this.current instanceof Error ? ENABLED : this.current;
    this.current = {
      enabled: patch.enabled ?? base.enabled,
      sameDayAllowed: patch.sameDayAllowed ?? base.sameDayAllowed,
      updatedAt: '2026-10-14T08:00:00.000Z',
      updatedBy: 'Hugo',
    };
    return Promise.resolve();
  }
}

async function mount(
  api: FakeSwitch,
  permissions: readonly StaffPermission[] = ['lfc_order_settings:read', 'lfc_order_settings:write'],
): Promise<{ fixture: ComponentFixture<CutoffSwitchCard>; served: boolean[] }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CutoffSwitchCard],
    providers: [
      { provide: OrderCutoffSettingsService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CutoffSwitchCard);
  const served: boolean[] = [];
  fixture.componentInstance.enabledChange.subscribe((value) => served.push(value));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, served };
}

const text = (fixture: ComponentFixture<CutoffSwitchCard>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('CutoffSwitchCard', () => {
  it('montre l’heure limite activée, et remonte l’état servi', async () => {
    const { fixture, served } = await mount(new FakeSwitch(ENABLED));

    expect(text(fixture)).toContain('Activée');
    expect(text(fixture)).toContain('Désactiver');
    expect(served).toEqual([true]);
  });

  it('sans `lfc_order_settings:write`, montre l’état sans bascule', async () => {
    const { fixture } = await mount(new FakeSwitch(ENABLED), ['lfc_order_settings:read']);

    expect(text(fixture)).toContain('Activée');
    expect((fixture.nativeElement as HTMLElement).querySelector('fold-inline-confirm')).toBeNull();
  });

  it('la confirmation dit l’effet : l’arrêt du plan devient la limite, l’arrêt n’est plus borné', async () => {
    const { fixture } = await mount(new FakeSwitch(ENABLED));

    expect(fixture.componentInstance['effect']()).toContain('plan de production n’est pas arrêté');
    expect(fixture.componentInstance['effect']()).toContain('ne sera plus bornée');
  });

  it('désactive à la confirmation, relit, et remonte le nouvel état', async () => {
    const api = new FakeSwitch(ENABLED);
    const { fixture, served } = await mount(api);

    await fixture.componentInstance['toggle']();
    fixture.detectChanges();

    expect(api.patches).toEqual([{ enabled: false }]);
    expect(served).toEqual([true, false]);
    expect(text(fixture)).toContain('Désactivée');
    expect(text(fixture)).toContain('Réactiver');
    expect(text(fixture)).toContain("L'heure d'arrêt du fournil n'est plus bornée");
    expect(text(fixture)).toContain('Dernier réglage par Hugo');
  });

  it('dit un refus du serveur et garde l’état servi', async () => {
    const api = new FakeSwitch(ENABLED);
    api.refusal = new Error('refusé');
    const { fixture, served } = await mount(api);

    await fixture.componentInstance['toggle']();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('fold-callout')).not.toBeNull();
    expect(text(fixture)).toContain('Activée');
    expect(served).toEqual([true]);
  });

  it('propose de réessayer quand la lecture échoue', async () => {
    const { fixture } = await mount(new FakeSwitch(new Error('panne')));

    expect(text(fixture)).toContain("Impossible de charger l'heure limite générale");
  });

  /** §8.3 (Hugo, 2026-10-14) : le jour même est un réglage, fermé par défaut. */
  it('dit le jour même non autorisé, et l’ouvre à la confirmation', async () => {
    const api = new FakeSwitch(ENABLED);
    const { fixture, served } = await mount(api);
    const block = (): string =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-same-day]')?.textContent ?? '';

    expect(block()).toContain('le premier jour proposé et accepté est demain');
    await fixture.componentInstance['toggleSameDay']();
    fixture.detectChanges();

    expect(api.patches).toEqual([{ sameDayAllowed: true }]);
    expect(block()).toContain('Autorisées');
    expect(served).toEqual([true, true]);
  });
});
