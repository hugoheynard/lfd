import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CompanyView,
  PrincipalSitesMenuView,
  SubAccountMenuBody,
  SubAccountMenuView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { TOMMEUSES } from '../../mon-compte/account.fixture';
import { ManageableSites } from '../manageable-sites';
import { SiteMenuGateway } from '../site-menu.gateway';
import { SitesPage } from './sites-page';

const CHALET: CompanyView = { ...TOMMEUSES, id: 'cmp_chalet', enseigne: 'Chalet des Neiges' };
const REFUGE: CompanyView = { ...TOMMEUSES, id: 'cmp_refuge', enseigne: 'Refuge' };

const COMMON: SubAccountMenuBody = {
  mode: 'except',
  offMenu: 'visible_locked',
  entries: [{ level: 'family', ref: 'cat_patis', effect: 'exclude' }],
  updatedAt: '2026-11-20T08:00:00.000Z',
  updatedBy: 'principal',
};

let menus: Record<string, SubAccountMenuView>;
let states: string[];
let fixture: ComponentFixture<SitesPage>;

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
}

async function render(sites: readonly CompanyView[], settled = true): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ManageableSites,
        useValue: {
          sites: signal(sites),
          settled: computed(() => settled),
          principalId: computed(() => (sites.length > 0 ? 'cmp_principal' : null)),
        },
      },
      {
        provide: SiteMenuGateway,
        useValue: {
          readSitesMenu: (companyId: string): Promise<PrincipalSitesMenuView> =>
            Promise.resolve({ companyId, menu: COMMON }),
          read: (id: string) => {
            const view = menus[id];
            return view === undefined ? Promise.reject(new Error('404')) : Promise.resolve(view);
          },
          setState: (id: string, state: string) => {
            states.push(state);
            const before = menus[id];
            if (before !== undefined) {
              menus[id] = { ...before, state: 'common' };
            }
            return Promise.resolve(null);
          },
        },
      },
      { provide: NotifyService, useValue: { success: vi.fn() } },
    ],
  });
  fixture = TestBed.createComponent(SitesPage);
  fixture.detectChanges();
  await settle();
  return fixture.nativeElement as HTMLElement;
}

beforeEach(() => {
  menus = {
    cmp_chalet: { companyId: 'cmp_chalet', state: 'common', menu: null, common: COMMON },
    cmp_refuge: { companyId: 'cmp_refuge', state: 'own', menu: COMMON, common: COMMON },
  };
  states = [];
});

describe('SitesPage', () => {
  it('met la carte commune en tête, et chaque site avec un lien vers sa carte', async () => {
    const host = await render([CHALET]);
    expect(host.querySelector('[data-common]')?.textContent).toContain('1 entrées');
    expect(host.querySelector('[data-open-common]')?.getAttribute('href')).toBe(
      '/mes-sites/carte-commune',
    );
    const cards = host.querySelectorAll('[data-site]');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain('Chalet des Neiges');
    expect(host.querySelector('[data-open-menu]')?.getAttribute('href')).toBe(
      '/mes-sites/cmp_chalet/carte',
    );
  });

  it('dit l’état de chaque site, et ne propose le retour qu’à une carte propre', async () => {
    const host = await render([CHALET, REFUGE]);
    const chalet = host.querySelector('[data-site][data-state="common"]');
    const refuge = host.querySelector('[data-site][data-state="own"]');
    expect(chalet?.textContent).toContain('Carte commune');
    expect(chalet?.textContent).toContain('Faire une carte propre');
    expect(chalet?.querySelector('[data-follow-common]')).toBeNull();
    expect(refuge?.textContent).toContain('Carte propre');

    refuge?.querySelector<HTMLButtonElement>('[data-follow-common]')?.click();
    await settle();
    expect(states).toEqual(['follows_common']);
    expect(host.querySelectorAll('[data-site][data-state="common"]')).toHaveLength(2);
  });

  it('dit qu’une carte n’a pas pu être lue', async () => {
    delete menus['cmp_chalet'];
    const host = await render([CHALET]);
    expect(host.querySelector('[data-read-failed]')).not.toBeNull();
  });

  it('dit qu’aucun site n’est rattaché', async () => {
    const host = await render([]);
    expect(host.querySelector('fold-empty-state')?.textContent).toContain('Aucun site');
    expect(host.querySelector('[data-common]')).toBeNull();
  });

  it('attend le compte avant de juger', async () => {
    expect((await render([], false)).querySelector('fold-loading')).not.toBeNull();
  });
});
