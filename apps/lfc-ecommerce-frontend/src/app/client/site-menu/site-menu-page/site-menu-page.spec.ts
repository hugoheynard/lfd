import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type {
  CompanyView,
  SubAccountMenuBody,
  SubAccountMenuPayload,
  SubAccountMenuView,
} from '@lfd/contracts';
import { FoldListboxComponent, FoldViewToggleComponent } from 'fold-ng';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { TOMMEUSES } from '../../mon-compte/account.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { NESTED_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ManageableSites } from '../manageable-sites';
import { SiteMenuGateway } from '../site-menu.gateway';
import { SiteMenuPage } from './site-menu-page';

const CHALET: CompanyView = { ...TOMMEUSES, id: 'cmp_chalet', enseigne: 'Chalet' };
const REFUGE: CompanyView = { ...TOMMEUSES, id: 'cmp_refuge', enseigne: 'Refuge' };

const POSED_MENU: SubAccountMenuBody = {
  mode: 'except',
  offMenu: 'visible_locked',
  entries: [{ level: 'family', ref: 'cat_patis', effect: 'exclude' }],
  updatedAt: '2026-11-20T08:00:00.000Z',
  updatedBy: 'principal',
};
const POSED: SubAccountMenuView = { companyId: 'cmp_chalet', menu: POSED_MENU };

let menus: Record<string, SubAccountMenuView>;
let saved: { id: string; payload: SubAccountMenuPayload }[];
let saveAnswer: string | null;
let success: ReturnType<typeof vi.fn>;
let fixture: ComponentFixture<SiteMenuPage>;

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
}

async function render(siteId = 'cmp_chalet'): Promise<HTMLElement> {
  success = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ subAccountId: siteId })) },
      },
      {
        provide: ManageableSites,
        useValue: {
          sites: signal([CHALET, REFUGE]),
          settled: computed(() => true),
          siteOf: (id: string) => [CHALET, REFUGE].find((site) => site.id === id) ?? null,
        },
      },
      {
        provide: ShopCatalogue,
        useValue: {
          status: signal('ready'),
          items: signal(NESTED_CATALOGUE.items),
          shelves: signal(NESTED_CATALOGUE.shelves),
          hydrate: () => Promise.resolve(),
        },
      },
      {
        provide: SiteMenuGateway,
        useValue: {
          read: (id: string) => {
            const view = menus[id];
            return view === undefined ? Promise.reject(new Error('404')) : Promise.resolve(view);
          },
          save: (id: string, payload: SubAccountMenuPayload) => {
            saved.push({ id, payload });
            return Promise.resolve(saveAnswer);
          },
        },
      },
      { provide: NotifyService, useValue: { success } },
    ],
  });
  fixture = TestBed.createComponent(SiteMenuPage);
  fixture.detectChanges();
  await settle();
  return fixture.nativeElement as HTMLElement;
}

function toggle(selector: string, index = 0): FoldViewToggleComponent {
  const found = fixture.debugElement.queryAll(By.css(selector))[index];
  return found?.componentInstance as FoldViewToggleComponent;
}

function saveButton(host: HTMLElement): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>('[data-save]');
}

beforeEach(() => {
  menus = { cmp_chalet: POSED, cmp_refuge: { companyId: 'cmp_refuge', menu: null } };
  saved = [];
  saveAnswer = null;
});

describe('SiteMenuPage', () => {
  it('résume la carte lue : la famille Pâtisseries exclue ferme trois articles sur quatre', async () => {
    const host = await render();
    expect(host.querySelector('[data-summary]')?.textContent?.trim()).toBe(
      '1 articles ouverts sur 4',
    );
  });

  it('n’active Enregistrer qu’une fois la carte modifiée', async () => {
    const host = await render();
    expect(saveButton(host)?.disabled).toBe(true);

    toggle('[data-mode]').value.set('only');
    fixture.detectChanges();
    expect(saveButton(host)?.disabled).toBe(false);
  });

  it('pose la carte ENTIÈRE, l’exception d’une exception comprise', async () => {
    const host = await render();
    // La tarte, sous Pâtisseries exclue, est incluse à son grain.
    const tart = fixture.debugElement
      .queryAll(By.css('[data-item]'))
      .find((row) => (row.nativeElement as HTMLElement).textContent?.includes('Tarte'));
    const tartToggle = tart?.query(By.directive(FoldViewToggleComponent))
      .componentInstance as FoldViewToggleComponent;
    tartToggle.value.set('include');
    fixture.detectChanges();

    saveButton(host)?.click();
    await settle();

    expect(saved).toEqual([
      {
        id: 'cmp_chalet',
        payload: {
          mode: 'except',
          offMenu: 'visible_locked',
          entries: [
            { level: 'family', ref: 'cat_patis', effect: 'exclude' },
            { level: 'product', ref: 'PAT-TAR', effect: 'include' },
          ],
        },
      },
    ]);
    expect(success).toHaveBeenCalledWith('Carte enregistrée.');
    expect(saveButton(host)?.disabled).toBe(true);
  });

  it('garde le refus du serveur sous les yeux', async () => {
    saveAnswer = 'Seul le propriétaire ou l’administrateur du compte principal règle cette carte.';
    const host = await render();
    toggle('[data-off-menu]').value.set('hidden');
    fixture.detectChanges();

    saveButton(host)?.click();
    await settle();

    expect(host.querySelector('[data-refusal]')?.textContent).toContain('Seul le propriétaire');
    expect(success).not.toHaveBeenCalled();
  });

  it('dit en clair qu’une carte « Seulement » sans entrée ferme tout', async () => {
    menus['cmp_chalet'] = {
      companyId: 'cmp_chalet',
      menu: { ...POSED_MENU, mode: 'only', entries: [] },
    };
    const host = await render();
    expect(host.querySelector('[data-closed-all]')).not.toBeNull();
  });

  it('copie la carte d’un autre site dans le brouillon (Q4)', async () => {
    menus['cmp_refuge'] = {
      companyId: 'cmp_refuge',
      menu: { ...POSED_MENU, mode: 'only', entries: [] },
    };
    const host = await render();
    const listbox = fixture.debugElement.query(By.directive(FoldListboxComponent))
      .componentInstance as FoldListboxComponent<string>;
    listbox.selectionChange.emit('cmp_refuge');
    await settle();

    expect(host.querySelector('[data-copy-notice]')?.textContent).toContain('Refuge');
    expect(host.querySelector('[data-closed-all]')).not.toBeNull();
    expect(saved).toEqual([]);
    expect(saveButton(host)?.disabled).toBe(false);
  });

  it('dit qu’il n’y a rien à copier d’un site sans carte', async () => {
    const host = await render();
    const listbox = fixture.debugElement.query(By.directive(FoldListboxComponent))
      .componentInstance as FoldListboxComponent<string>;
    listbox.selectionChange.emit('cmp_refuge');
    await settle();

    expect(host.querySelector('[data-copy-notice]')?.textContent).toContain('n’a pas de carte');
    expect(saveButton(host)?.disabled).toBe(true);
  });

  it('montre une entrée que le catalogue ne livre plus, et la retire', async () => {
    menus['cmp_chalet'] = {
      companyId: 'cmp_chalet',
      menu: { ...POSED_MENU, entries: [{ level: 'sku', ref: 'GONE-1', effect: 'exclude' }] },
    };
    const host = await render();
    const stale = host.querySelector('[data-stale]');
    expect(stale?.textContent).toContain('GONE-1');

    stale?.querySelector<HTMLButtonElement>('button')?.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-stale]')).toBeNull();
    expect(saveButton(host)?.disabled).toBe(false);
  });

  it('refuse un site que l’espace ne règle pas', async () => {
    const host = await render('cmp_unknown');
    expect(host.querySelector('[data-unknown-site]')).not.toBeNull();
  });

  it('dit l’échec de lecture de la carte', async () => {
    delete menus['cmp_chalet'];
    const host = await render();
    expect(host.querySelector('[data-menu-failed]')).not.toBeNull();
  });
});
