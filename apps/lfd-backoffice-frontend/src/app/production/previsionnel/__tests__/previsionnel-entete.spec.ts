import { provideRouter } from '@angular/router';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ProductionForecastView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminCatalogService } from '../../../commandes/catalog.service';
import { PrevisionnelPage } from '../previsionnel-page';
import { ProductionService } from '../../production.service';

/**
 * **L'en-tête du prévisionnel** (2026-10-06) : le rattrapage passe avant le
 * titre, et le dossier du jour s'ouvre par le bouton de la colonne de son jour
 * (2026-11-02) — plus par un bouton au-dessus, qui ouvrait « demain » sans le dire.
 */

/** Une journée relative à maintenant, `AAAA-MM-JJ` en heure locale (CLAUDE.md §5). */
function dayIn(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const dayOfMonth = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

function openDay(date: string): ProductionForecastView['days'][number] {
  return {
    date,
    totalUnits: 120,
    orderCount: 4,
    resupplyUnits: 0,
    closed: false,
    state: 'open',
    closesAt: null,
  };
}

/** Une ligne : sans pièce, la grille cède à l'état vide et ses colonnes avec. */
const FORECAST: ProductionForecastView = {
  days: [openDay(dayIn(0)), openDay(dayIn(1))],
  lines: [
    {
      sku: 'PAIN-1',
      productName: 'Baguette',
      saleUnit: 'piece',
      quantities: [10, 10],
      resupplyQuantities: [0, 0],
      totalUnits: 20,
    },
  ],
  peakDate: dayIn(0),
  totalUnits: 20,
};

/** « Dossier du jour » sous la colonne `index`. */
function openDossier(el: HTMLElement, index: number): void {
  (
    el.querySelectorAll('[data-column-action="dossier"]')[index] as HTMLButtonElement | undefined
  )?.click();
}

async function render(): Promise<ComponentFixture<PrevisionnelPage>> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      // `batch` manque exprès : le dossier, s'il s'ouvre, tombe dans son état
      // d'erreur — ce qui est éprouvé ici est l'en-tête, pas le dossier.
      { provide: ProductionService, useValue: { forecast: async () => FORECAST } },
      { provide: AdminCatalogService, useValue: { list: async () => [] } },
    ],
  });
  const fixture = TestBed.createComponent(PrevisionnelPage);
  fixture.detectChanges();
  await TestBed.runInInjectionContext(() => fixture.componentInstance['load']());
  fixture.detectChanges();
  return fixture;
}

function buttonNamed(el: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

describe('l’en-tête du prévisionnel', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('pose le rattrapage AVANT le titre, hors de la bande de tête', async () => {
    const el = (await render()).nativeElement as HTMLElement;

    const callout = el.querySelector('.pv-catch-up fold-callout');
    const title = el.querySelector('.pv-title');
    expect(callout).not.toBeNull();
    expect(callout?.closest('.pv-masthead')).toBeNull();
    if (callout === null || title === null) {
      throw new Error('rattrapage ou titre absent');
    }
    expect(callout.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ne montre plus ni onglet ni légende', async () => {
    const el = (await render()).nativeElement as HTMLElement;

    expect(el.querySelector('fold-view-toggle')).toBeNull();
    expect(el.querySelector('.pv-legend')).toBeNull();
    expect(el.textContent).not.toContain('mur');
  });

  it('ouvre le dossier par le bouton d’une colonne, et en revient', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    openDossier(el, 0);
    fixture.detectChanges();
    expect(el.querySelector('app-dossier-du-jour')).not.toBeNull();
    expect(buttonNamed(el, 'Semaine suivante')).toBeUndefined();

    buttonNamed(el, 'Retour au prévisionnel')?.click();
    fixture.detectChanges();
    expect(el.querySelector('app-dossier-du-jour')).toBeNull();
    expect(el.querySelectorAll('[data-column-action="dossier"]')).toHaveLength(2);
  });

  it('titre le dossier par SA journée, et suit quand on la change', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const label = (date: string): string =>
      new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(`${date}T00:00:00`),
      );

    // La colonne de demain ouvre le dossier de demain.
    openDossier(el, 1);
    fixture.detectChanges();
    expect(el.querySelector('.pv-title')?.textContent?.trim()).toBe(
      `Le tirage du ${label(dayIn(1))}`,
    );

    const input = el.querySelector<HTMLInputElement>('#pr-date');
    if (input === null) {
      throw new Error('sélecteur de journée absent');
    }
    input.value = dayIn(3);
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('.pv-title')?.textContent?.trim()).toBe(
      `Le tirage du ${label(dayIn(3))}`,
    );
  });
});
