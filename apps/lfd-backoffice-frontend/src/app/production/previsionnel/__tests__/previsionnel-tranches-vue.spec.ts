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

/** `AAAA-MM-JJ` à `offset` jours d'aujourd'hui — jamais une date écrite en dur. */
function dayIn(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

/** Une ligne, pour que la semaine ne soit pas vide : sans pièce, la grille cède à l'état vide. */
function weekWithBread(days: ProductionForecastView['days']): ProductionForecastView {
  return {
    days,
    lines: [
      {
        sku: 'PAIN-1',
        productName: 'Baguette',
        saleUnit: 'piece',
        quantities: days.map(() => 10),
        resupplyQuantities: days.map(() => 0),
        totalUnits: 10 * days.length,
      },
    ],
    peakDate: null,
    totalUnits: 10 * days.length,
  };
}

/** Une semaine qui commence aujourd'hui : une colonne, donc ses boutons, par jour. */
const FORECAST: ProductionForecastView = weekWithBread(
  [0, 1, 2, 3, 4, 5, 6].map((offset) => ({
    date: dayIn(offset),
    totalUnits: 10,
    orderCount: 1,
    resupplyUnits: 0,
    closed: false,
    state: 'open' as const,
    closesAt: null,
  })),
);

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

/** « Par tranche horaire » sous la colonne `index` de la semaine. */
function enterColumn(el: HTMLElement, index: number): void {
  (
    el.querySelectorAll('[data-column-action="tranches"]')[index] as HTMLButtonElement | undefined
  )?.click();
}

function buttonNamed(el: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

describe('la journée par tranche, dans le prévisionnel', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('s’ouvre par la colonne d’un jour, en plein mur, et se referme', async () => {
    const { fixture } = await render();
    const el = fixture.nativeElement as HTMLElement;

    enterColumn(el, 0);
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
    enterColumn(el, 0);
    await settle(fixture);
    const first = asked.at(-1);
    const title = el.querySelector('.pv-title')?.textContent;

    (el.querySelector('[data-tranche-next] button') as HTMLButtonElement | null)?.click();
    await settle(fixture);

    expect(asked.at(-1)).not.toBe(first);
    expect(first !== undefined && (asked.at(-1) ?? '') > first).toBe(true);
    expect(el.querySelector('.pv-title')?.textContent).not.toBe(title);
  });

  /**
   * Hugo, 2026-11-02 : le bouton du haut ouvrait « demain » sans le dire ; il
   * est retiré, et chaque colonne ouvre SA journée.
   */
  it('le bouton d’une colonne ouvre la journée de cette colonne', async () => {
    const { fixture, asked } = await render();
    const el = fixture.nativeElement as HTMLElement;
    expect(buttonNamed(el, 'Journée par tranche')).toBeUndefined();
    expect(el.querySelector('.pv-masthead [icon="print"]')).toBeNull();

    enterColumn(el, 2);
    await settle(fixture);

    expect(asked.at(-1)).toBe(dayIn(2));
  });
});
