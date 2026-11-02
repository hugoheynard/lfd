import { provideRouter } from '@angular/router';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ProductionForecastView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminCatalogService } from '../../../commandes/catalog.service';
import { PrevisionnelPage } from '../previsionnel-page';
import { ProductionService } from '../../production.service';
import { WorksheetService } from '../../worksheet.service';

/**
 * **La journée par tranche**, troisième vue du prévisionnel (2026-11-01) : on
 * y va par un bouton, elle est plein mur, elle change de journée d'un geste
 * et on en revient.
 */

const FORECAST: ProductionForecastView = { days: [], lines: [], peakDate: null, totalUnits: 0 };

async function settle(fixture: ComponentFixture<PrevisionnelPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

async function render(): Promise<{ fixture: ComponentFixture<PrevisionnelPage>; asked: string[] }> {
  const asked: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ProductionService,
        useValue: {
          forecast: async (from: string, to: string) => {
            if (from === to) {
              asked.push(from);
            }
            return FORECAST;
          },
          dueThresholds: async () => {
            throw new Error('hors sujet');
          },
        },
      },
      {
        provide: WorksheetService,
        useValue: { worksheet: async () => Promise.reject(new Error()) },
      },
      { provide: AdminCatalogService, useValue: { list: async () => [] } },
    ],
  });
  const fixture = TestBed.createComponent(PrevisionnelPage);
  await settle(fixture);
  return { fixture, asked };
}

function buttonNamed(el: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

describe('la journée par tranche, dans le prévisionnel', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('s’ouvre par « Journée par tranche », en plein mur, et se referme', async () => {
    const { fixture } = await render();
    const el = fixture.nativeElement as HTMLElement;

    buttonNamed(el, 'Journée par tranche')?.click();
    await settle(fixture);

    expect(el.querySelector('app-day-tranche-wall')).not.toBeNull();
    expect(el.classList.contains('is-wall')).toBe(true);
    expect(el.querySelector('.pv-title')?.textContent).toContain('par tranche');

    buttonNamed(el, 'Retour au prévisionnel')?.click();
    await settle(fixture);
    expect(el.querySelector('app-day-tranche-wall')).toBeNull();
  });

  it('change de journée par les chevrons, et relit la journée demandée', async () => {
    const { fixture, asked } = await render();
    const el = fixture.nativeElement as HTMLElement;
    buttonNamed(el, 'Journée par tranche')?.click();
    await settle(fixture);
    const first = asked.at(-1);
    const title = el.querySelector('.pv-title')?.textContent;

    (el.querySelector('[data-tranche-next] button') as HTMLButtonElement | null)?.click();
    await settle(fixture);

    expect(asked.at(-1)).not.toBe(first);
    expect(first !== undefined && (asked.at(-1) ?? '') > first).toBe(true);
    expect(el.querySelector('.pv-title')?.textContent).not.toBe(title);
  });

  /** Hugo, 2026-11-02 : elle s'ouvrait sur demain, alors qu'on y suit la fournée de ce matin. */
  it('s’ouvre sur aujourd’hui', async () => {
    const { fixture, asked } = await render();
    const el = fixture.nativeElement as HTMLElement;
    buttonNamed(el, 'Journée par tranche')?.click();
    await settle(fixture);

    const now = new Date();
    const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    expect(asked.at(-1)).toBe(today);
  });
});
