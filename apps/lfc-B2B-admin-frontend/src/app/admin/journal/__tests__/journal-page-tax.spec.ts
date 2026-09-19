import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { ActivityPageView } from '@lfd/contracts';
import { FoldListboxComponent, FoldPageLayoutComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { JournalPage } from '../journal-page';
import { JOURNAL_SOURCE_KEY } from '../journal-source';
import { JournalService, type JournalFilters, type TaxJournalFilters } from '../journal.service';

/**
 * **Le journal fiscal** (plan journalisation, lot 4) : l'écran Journal, lu sur
 * la tranche fiscale. Ce que ces cas protègent : la comptabilité n'a pas
 * `activity:read` — l'écran ne doit donc JAMAIS appeler le journal entier, qui
 * lui rendrait 403, ni lui offrir un filtre par module que la route n'a pas.
 */

const EMPTY_PAGE: ActivityPageView = {
  events: [],
  nextBefore: null,
  total: 0,
  page: 1,
  asOf: null,
};

interface Mounted {
  readonly fixture: ComponentFixture<unknown>;
  readonly general: JournalFilters[];
  readonly tax: TaxJournalFilters[];
  readonly router: Router;
}

/**
 * Deux routes vers le même écran, comme dans l'app : `journal-fiscal` déclare
 * sa source (cf. `pim.routes.ts`), `journal` ne déclare rien.
 */
async function mount(url = '/journal-fiscal'): Promise<Mounted> {
  const general: JournalFilters[] = [];
  const tax: TaxJournalFilters[] = [];
  const service: Pick<JournalService, 'page' | 'taxPage'> = {
    page: (filters) => {
      general.push(filters);
      return Promise.resolve(EMPTY_PAGE);
    },
    taxPage: (filters) => {
      tax.push(filters);
      return Promise.resolve(EMPTY_PAGE);
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'journal-fiscal', component: JournalPage, data: { [JOURNAL_SOURCE_KEY]: 'tax' } },
        { path: 'journal', component: JournalPage },
      ]),
      { provide: JournalService, useValue: service },
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  await harness.fixture.whenStable();
  harness.fixture.detectChanges();
  return { fixture: harness.fixture, general, tax, router: TestBed.inject(Router) };
}

function listboxLabels(fixture: ComponentFixture<unknown>): string[] {
  return fixture.debugElement
    .queryAll(By.directive(FoldListboxComponent))
    .map((debug) => debug.injector.get(FoldListboxComponent).label() ?? '');
}

function pageTitle(fixture: ComponentFixture<unknown>): string | undefined {
  return fixture.debugElement
    .query(By.directive(FoldPageLayoutComponent))
    .injector.get(FoldPageLayoutComponent)
    .title();
}

describe('le journal fiscal', () => {
  it('lit la tranche fiscale, et jamais le journal entier', async () => {
    const { general, tax } = await mount();

    expect(tax).toHaveLength(1);
    expect(tax[0]).toMatchObject({ page: 1, limit: 50 });
    expect(general).toHaveLength(0);
  });

  it('n’offre pas de filtre par module', async () => {
    const { fixture } = await mount();

    expect(listboxLabels(fixture)).toEqual(['Période']);
  });

  it('se présente comme le journal fiscal', async () => {
    const { fixture } = await mount();

    expect(pageTitle(fixture)).toBe('Journal fiscal');
    expect(String(fixture.nativeElement.textContent)).toContain('règles');
  });

  /** « Tout ce qui touche au taux » (Hugo, 2026-09-19) : l'intro dit ce que la vue rend. */
  it('nomme les contextes de vente et la surtaxe dans ce qu’elle montre', async () => {
    const { fixture } = await mount();
    const intro = String(fixture.nativeElement.textContent);

    expect(intro).toContain('contextes de vente');
    expect(intro).toContain('surtaxe de retard');
  });

  /** Un lien collé depuis le journal entier : le module n'élargit rien, il est retiré. */
  it('ignore un module venu de l’adresse, et l’en retire', async () => {
    const { tax, router } = await mount('/journal-fiscal?module=pim&actorId=stf_1');

    expect(tax[0]).not.toHaveProperty('module');
    expect(tax[0]).toMatchObject({ actorId: 'stf_1' });
    expect(router.url).not.toContain('module=');
    expect(router.url).toContain('actorId=stf_1');
  });

  /** La route d'origine ne déclare rien : elle reste le journal entier, filtre par module compris. */
  it('laisse le journal d’activité tel qu’il était sans source déclarée', async () => {
    const { fixture, general, tax } = await mount('/journal?module=pim');

    expect(general[0]).toMatchObject({ module: 'pim' });
    expect(tax).toHaveLength(0);
    expect(listboxLabels(fixture)).toEqual(['Module', 'Période']);
    expect(pageTitle(fixture)).toBe("Journal d'activité");
  });
});
