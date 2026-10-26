import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryRoundsService } from '../delivery-rounds.service';
import { DayCalendar } from '../../shared/day-calendar/day-calendar';
import { parisDayOf, shiftDay } from '../run-sheet';
import { daysBetween, TourManagerDay } from './tour-manager-day';
import { stampLabelOf, TourManagerWorkspacePage } from './tour-manager-workspace-page';

/** Un onglet doublé : il dit le jour qu'il lit au bandeau. */
@Component({ template: '<p data-tab-day>{{ day() }}</p>' })
class TabStub {
  protected readonly day = inject(TourManagerDay).day;
}

const BOTH: readonly StaffPermission[] = ['delivery_rounds:read', 'delivery_run_sheet:read'];

const dayDossierPdf = vi.fn((_day: string) => Promise.resolve(new Blob()));

async function open(url: string, granted: readonly StaffPermission[] = BOTH) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: 'tour-manager',
          component: TourManagerWorkspacePage,
          children: [
            { path: 'tournees', component: TabStub },
            { path: 'feuille-de-route', component: TabStub },
          ],
        },
      ]),
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => granted.includes(permission) },
      },
      { provide: DeliveryRoundsService, useValue: { dayDossierPdf } },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  harness.detectChanges();
  return { harness, element: harness.fixture.nativeElement as HTMLElement };
}

function tabDay(element: HTMLElement): string | undefined {
  return element.querySelector('[data-tab-day]')?.textContent?.trim();
}

describe('le bandeau de Tour manager (2026-10-26)', () => {
  it('porte le switch des onglets, le jour et son calendrier, et la date et l’heure', async () => {
    const { element } = await open('/tour-manager/tournees?jour=2026-10-27');
    expect(element.querySelector('[data-tour-manager-tabs]')).not.toBeNull();
    expect(element.querySelector('[data-day-toggle]')).not.toBeNull();
    expect(element.querySelector('app-day-calendar')).not.toBeNull();
    expect(element.querySelector('[data-stamp]')?.textContent).toContain(' h ');
  });

  it('change d’onglet en gardant le jour choisi', async () => {
    const { harness, element } = await open('/tour-manager/tournees?jour=2026-10-27');
    expect(tabDay(element)).toBe('2026-10-27');

    harness.fixture.debugElement
      .query(By.css('[data-tour-manager-tabs]'))
      .triggerEventHandler('valueChange', 'feuille-de-route');
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/tour-manager/feuille-de-route?jour=2026-10-27');
    expect(tabDay(element)).toBe('2026-10-27');
  });

  it('n’offre que les onglets permis', async () => {
    const { harness } = await open('/tour-manager/feuille-de-route', ['delivery_run_sheet:read']);
    const toggle = harness.fixture.debugElement.query(By.css('[data-tour-manager-tabs]'));
    expect(
      (toggle.componentInstance as { options: () => readonly { value: string }[] })
        .options()
        .map((option) => option.value),
    ).toEqual(['feuille-de-route']);
  });

  it('demain par défaut, segment « Demain » allumé', async () => {
    const { harness, element } = await open('/tour-manager/tournees');
    expect(tabDay(element)).toBe(shiftDay(parisDayOf(new Date()), 1));
    const toggle = harness.fixture.debugElement.query(By.css('[data-day-toggle]'));
    expect((toggle.componentInstance as { value: () => string }).value()).toBe('1');
  });

  it('ouvre une date lointaine par le calendrier : elle passe dans l’adresse, aucun segment allumé', async () => {
    const { harness, element } = await open('/tour-manager/feuille-de-route');
    const far = shiftDay(parisDayOf(new Date()), 40);

    harness.fixture.debugElement.query(By.directive(DayCalendar)).triggerEventHandler('pick', far);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe(`/tour-manager/feuille-de-route?jour=${far}`);
    expect(tabDay(element)).toBe(far);
    expect(
      element.querySelector('app-day-calendar button[data-calendar]')?.textContent?.trim(),
    ).not.toBe('');
  });

  it('« Aujourd’hui » du calendrier revient au jour du poste', async () => {
    const { harness, element } = await open('/tour-manager/tournees?jour=2026-01-05');
    harness.fixture.debugElement.query(By.directive(DayCalendar)).triggerEventHandler('pick', null);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(tabDay(element)).toBe(parisDayOf(new Date()));
  });
});

describe('daysBetween / stampLabelOf', () => {
  it('compte en jours, mois et années franchis', () => {
    expect(daysBetween('2026-11-01', '2026-10-31')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(-1);
  });

  it('dit l’heure comme au fournil, pas « 14:05 »', () => {
    expect(stampLabelOf(new Date('2026-10-26T13:05:00Z'))).toBe('lundi 26 oct. · 14 h 05');
  });

  describe('le dossier du jour (2026-10-26)', () => {
    it('ouvre le dossier des tournées du jour commun', async () => {
      dayDossierPdf.mockClear();
      const open$ = vi.spyOn(window, 'open').mockReturnValue(null);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dossier');
      const { harness, element } = await open('/tour-manager/feuille-de-route?jour=2026-10-27');
      const button = element.querySelector<HTMLButtonElement>('[data-print-dossier]');
      expect(button?.textContent).toContain('Imprimer le dossier du jour');

      button?.click();
      await harness.fixture.whenStable();

      expect(dayDossierPdf).toHaveBeenCalledWith('2026-10-27');
      expect(open$).toHaveBeenCalledWith('blob:dossier', '_blank');
      vi.restoreAllMocks();
    });

    it('n’est pas offert sans le droit de lire les tournées', async () => {
      const { element } = await open('/tour-manager/feuille-de-route', ['delivery_run_sheet:read']);
      expect(element.querySelector('[data-print-dossier]')).toBeNull();
    });
  });
});
