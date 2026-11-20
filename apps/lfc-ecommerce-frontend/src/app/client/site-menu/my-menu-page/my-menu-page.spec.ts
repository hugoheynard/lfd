import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SubAccountMenuBody, SubAccountMenuView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ClientContext } from '../../client-context.service';
import { NESTED_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { SiteMenuGateway } from '../site-menu.gateway';
import { MyMenuPage } from './my-menu-page';

const COMMON: SubAccountMenuBody = {
  mode: 'except',
  offMenu: 'visible_locked',
  entries: [{ level: 'family', ref: 'cat_patis', effect: 'exclude' }],
  updatedAt: '2026-11-20T08:00:00.000Z',
  updatedBy: 'principal',
};

let fixture: ComponentFixture<MyMenuPage>;

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
}

async function render(answer: () => Promise<SubAccountMenuView>): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ClientContext, useValue: { prefix: signal('cmp_chalet') } },
      {
        provide: ShopCatalogue,
        useValue: {
          status: signal('ready'),
          items: signal(NESTED_CATALOGUE.items),
          shelves: signal(NESTED_CATALOGUE.shelves),
          hydrate: () => Promise.resolve(),
        },
      },
      { provide: SiteMenuGateway, useValue: { read: answer } },
    ],
  });
  fixture = TestBed.createComponent(MyMenuPage);
  fixture.detectChanges();
  await settle();
  return fixture.nativeElement as HTMLElement;
}

describe('MyMenuPage', () => {
  it('lit la carte commune que le site suit, sans aucun geste d’écriture', async () => {
    const host = await render(() =>
      Promise.resolve({ companyId: 'cmp_chalet', state: 'common', menu: null, common: COMMON }),
    );
    expect(host.querySelector('[data-origin]')?.textContent).toContain('carte commune');
    expect(host.querySelector('[data-summary]')?.textContent?.trim()).toBe(
      '1 articles ouverts sur 4',
    );
    expect(host.querySelector('[data-save]')).toBeNull();
    expect(host.querySelector('fold-view-toggle')).toBeNull();
    expect(host.querySelector('fold-listbox')).toBeNull();
  });

  it('lit la carte propre du site, pas la commune qu’elle masque', async () => {
    const host = await render(() =>
      Promise.resolve({
        companyId: 'cmp_chalet',
        state: 'own',
        menu: { ...COMMON, entries: [] },
        common: COMMON,
      }),
    );
    expect(host.querySelector('[data-origin]')?.textContent).toContain('propre à votre site');
    expect(host.querySelector('[data-summary]')?.textContent?.trim()).toBe(
      '4 articles ouverts sur 4',
    );
  });

  it('dit qu’un site sans carte commande tout', async () => {
    const host = await render(() =>
      Promise.resolve({ companyId: 'cmp_chalet', state: 'none', menu: null, common: null }),
    );
    expect(host.querySelector('[data-no-menu]')).not.toBeNull();
  });

  it('un espace qui n’est pas un site n’a pas de carte à lire', async () => {
    const host = await render(() => Promise.reject(new HttpErrorResponse({ status: 404 })));
    expect(host.querySelector('[data-unavailable]')).not.toBeNull();
  });

  it('une panne se dit comme une panne', async () => {
    const host = await render(() => Promise.reject(new HttpErrorResponse({ status: 0 })));
    expect(host.querySelector('[data-menu-failed]')).not.toBeNull();
  });
});
