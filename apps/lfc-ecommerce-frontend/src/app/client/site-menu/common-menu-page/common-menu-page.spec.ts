import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { PrincipalSitesMenuView, SubAccountMenuPayload } from '@lfd/contracts';
import { FoldViewToggleComponent } from 'fold-ng';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { NESTED_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { ManageableSites } from '../manageable-sites';
import { SiteMenuGateway } from '../site-menu.gateway';
import { CommonMenuPage } from './common-menu-page';

let saved: { id: string; payload: SubAccountMenuPayload }[];
let success: ReturnType<typeof vi.fn>;
let fixture: ComponentFixture<CommonMenuPage>;

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
}

async function render(principalId: string | null): Promise<HTMLElement> {
  success = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ManageableSites,
        useValue: { settled: computed(() => true), principalId: computed(() => principalId) },
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
          readSitesMenu: (companyId: string): Promise<PrincipalSitesMenuView> =>
            Promise.resolve({ companyId, menu: null }),
          saveSitesMenu: (id: string, payload: SubAccountMenuPayload) => {
            saved.push({ id, payload });
            return Promise.resolve(null);
          },
        },
      },
      { provide: NotifyService, useValue: { success } },
    ],
  });
  fixture = TestBed.createComponent(CommonMenuPage);
  fixture.detectChanges();
  await settle();
  return fixture.nativeElement as HTMLElement;
}

beforeEach(() => {
  saved = [];
});

describe('CommonMenuPage', () => {
  it('pose la carte commune entière, sur le principal affiché', async () => {
    const host = await render('cmp_principal');
    expect(host.querySelector('[data-common-explain]')?.textContent).toContain('exempter');
    const mode = fixture.debugElement.query(By.css('[data-mode]'))
      .componentInstance as FoldViewToggleComponent;
    mode.value.set('only');
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-save]')?.click();
    await settle();

    expect(saved).toEqual([
      { id: 'cmp_principal', payload: { mode: 'only', offMenu: 'visible_locked', entries: [] } },
    ]);
    expect(success).toHaveBeenCalledWith('Carte commune enregistrée.');
  });

  it('refuse un espace qui ne règle pas de sites', async () => {
    const host = await render(null);
    expect(host.querySelector('[data-not-principal]')).not.toBeNull();
  });
});
