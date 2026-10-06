import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ProductionCloseSettingsPayload, ProductionSettingsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { ProductionSettingsService } from '../production-settings.service';
import { autoImpossibleReason, ProductionSettingsPage } from './production-settings-page';

const FAR_DAY = '2999-12-25';

interface Wire {
  view: ProductionSettingsView;
  closes: ProductionCloseSettingsPayload[];
  added: string[];
  removed: string[];
  refuse: string | null;
}

let wire: Wire;

function refusal(message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: { code: 'x', message } });
}

async function boot(canWrite = true): Promise<ComponentFixture<ProductionSettingsPage>> {
  wire = {
    view: {
      close: { mode: 'manual', closeAt: null, alertAt: '20:00' },
      latestOrderCutoff: { daysBefore: 1, time: '18:30' },
      closedDays: [FAR_DAY],
    },
    closes: [],
    added: [],
    removed: [],
    refuse: null,
  };
  const gate = (): Promise<void> =>
    wire.refuse === null ? Promise.resolve() : Promise.reject(refusal(wire.refuse));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductionSettingsPage],
    providers: [
      {
        provide: ProductionSettingsService,
        useValue: {
          settings: () => Promise.resolve(wire.view),
          changeClose: (payload: ProductionCloseSettingsPayload) => {
            wire.closes.push(payload);
            return gate();
          },
          addClosedDay: (date: string) => {
            wire.added.push(date);
            return gate();
          },
          removeClosedDay: (date: string) => {
            wire.removed.push(date);
            return gate();
          },
          dossierRecipients: () => Promise.resolve([]),
          dossierStaffCandidates: () => Promise.resolve([]),
        } satisfies Partial<Record<keyof ProductionSettingsService, unknown>>,
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: string) => canWrite || !permission.endsWith(':write'),
        } satisfies Pick<PermissionsStore, 'can'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(ProductionSettingsPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<ProductionSettingsPage>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function emit(
  fixture: ComponentFixture<ProductionSettingsPage>,
  selector: string,
  event: string,
  value: unknown = undefined,
): void {
  fixture.debugElement.query(By.css(selector)).triggerEventHandler(event, value);
  fixture.detectChanges();
}

function click(fixture: ComponentFixture<ProductionSettingsPage>, selector: string): void {
  const button = fixture.nativeElement.querySelector(selector) as HTMLButtonElement;
  button.click();
}

const has = (fixture: ComponentFixture<ProductionSettingsPage>, selector: string): boolean =>
  fixture.nativeElement.querySelector(selector) !== null;

describe('Production › Réglages — l’arrêt du plan', () => {
  it('bascule en automatique, envoie les deux heures — celle d’alerte est gardée', async () => {
    const fixture = await boot();
    expect(has(fixture, '[data-alert-at]')).toBe(true);

    emit(fixture, '[data-mode]', 'valueChange', 'auto');
    expect(has(fixture, '[data-close-at]')).toBe(true);
    expect(has(fixture, '[data-alert-at]')).toBe(false);

    emit(fixture, '[data-close-at]', 'valueChange', '21:00');
    click(fixture, '[data-save-close]');
    await settle(fixture);

    expect(wire.closes).toEqual([{ mode: 'auto', closeAt: '21:00', alertAt: '20:00' }]);
  });

  it('affiche le refus du serveur tel quel', async () => {
    const fixture = await boot();
    wire.refuse = 'L’heure d’arrêt 17:00 précède l’heure limite de commande, la veille à 18:30.';
    emit(fixture, '[data-alert-at]', 'valueChange', '21:00');
    click(fixture, '[data-save-close]');
    await settle(fixture);

    const callout = fixture.nativeElement.querySelector('[data-close-refusal]') as HTMLElement;
    expect(callout.textContent).toContain('précède l’heure limite de commande');
  });

  it('rappelle la dernière heure limite de commande', async () => {
    const fixture = await boot();
    const cutoff = fixture.nativeElement.querySelector('[data-cutoff]') as HTMLElement;
    expect(cutoff.textContent).toContain('Dernière heure limite de commande : la veille à 18:30');
  });

  it('dit pourquoi le mode automatique est impossible', () => {
    expect(autoImpossibleReason(null)).toContain('impossible');
    expect(autoImpossibleReason({ daysBefore: 0, time: '08:00' })).toContain('jour même');
    expect(autoImpossibleReason({ daysBefore: 1, time: '18:30' })).toBeNull();
  });
});

describe('Production › Réglages — les jours fermés', () => {
  it('ajoute un jour à venir', async () => {
    const fixture = await boot();
    emit(fixture, '[data-new-day]', 'valueChange', '2999-01-02');
    click(fixture, '[data-add-day]');
    await settle(fixture);
    expect(wire.added).toEqual(['2999-01-02']);
  });

  it('refuse d’ajouter un jour passé', async () => {
    const fixture = await boot();
    emit(fixture, '[data-new-day]', 'valueChange', '2000-01-02');
    const button = fixture.nativeElement.querySelector('[data-add-day]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('retire un jour par sa croix', async () => {
    const fixture = await boot();
    expect(fixture.nativeElement.querySelectorAll('[data-closed-day]').length).toBe(1);
    emit(fixture, '[data-remove-day]', 'clicked');
    await settle(fixture);
    expect(wire.removed).toEqual([FAR_DAY]);
  });
});

describe('Production › Réglages — sans droit d’écriture', () => {
  it('montre tout et ne propose aucun geste', async () => {
    const fixture = await boot(false);
    expect(has(fixture, '[data-alert-at]')).toBe(true);
    expect(has(fixture, '[data-closed-day]')).toBe(true);
    expect(has(fixture, '[data-save-close]')).toBe(false);
    expect(has(fixture, '[data-remove-day]')).toBe(false);
    expect(has(fixture, '[data-add-day]')).toBe(false);
  });
});
