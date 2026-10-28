import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { ProductionSettingsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { ProductionSettingsService } from '../production-settings.service';
import { automaticCloseLabel, ProductionSettingsPage } from './production-settings-page';

const FAR_DAY = '2999-12-25';

interface Wire {
  view: ProductionSettingsView;
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
      automaticClose: { daysBefore: 1, time: '23:00' },
      closedDays: [FAR_DAY],
      tranches: { mode: 'fixed', fixedTranches: [] },
    },
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
      provideRouter([]),
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

/** Depuis le 2026-10-21 (`plan-une-seule-heure.md` §5) : l'arrêt se lit, il ne se règle plus ici. */
describe('Production › Réglages — l’arrêt du plan, en lecture', () => {
  it('dit l’arrêt automatique à l’heure limite, avec le lien pour la régler', async () => {
    const fixture = await boot();
    const callout = fixture.nativeElement.querySelector('[data-automatic-close]') as HTMLElement;

    expect(callout.textContent).toContain(
      'Arrêt automatique à l’heure limite : la veille, 23 h (rattrapage compris)',
    );
    const link = callout.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/reglages/commandes/heure-limite');
  });

  it('ne propose plus ni mode, ni heure, ni enregistrement', async () => {
    const fixture = await boot();

    expect(has(fixture, '[data-mode]')).toBe(false);
    expect(has(fixture, '[data-close-at]')).toBe(false);
    expect(has(fixture, '[data-alert-at]')).toBe(false);
    expect(has(fixture, '[data-save-close]')).toBe(false);
  });

  it('prévient quand aucune heure limite n’est posée', async () => {
    const fixture = await boot();
    wire.view = { ...wire.view, automaticClose: null };
    await fixture.componentInstance['load']();
    fixture.detectChanges();

    expect(has(fixture, '[data-no-cutoff]')).toBe(true);
    expect(has(fixture, '[data-automatic-close]')).toBe(false);
  });

  it.each([
    [{ daysBefore: 1, time: '23:00' }, 'la veille, 23 h (rattrapage compris)'],
    [{ daysBefore: 1, time: '21:30' }, 'la veille, 21 h 30 (rattrapage compris)'],
    [{ daysBefore: 0, time: '00:30' }, 'le jour même, 0 h 30 (rattrapage compris)'],
    [{ daysBefore: 2, time: '12:00' }, '2 jours avant, 12 h (rattrapage compris)'],
  ])('dit %o « %s »', (close, label) => {
    expect(automaticCloseLabel(close)).toBe(label);
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
    expect(has(fixture, '[data-automatic-close]')).toBe(true);
    expect(has(fixture, '[data-closed-day]')).toBe(true);
    expect(has(fixture, '[data-remove-day]')).toBe(false);
    expect(has(fixture, '[data-add-day]')).toBe(false);
  });
});
