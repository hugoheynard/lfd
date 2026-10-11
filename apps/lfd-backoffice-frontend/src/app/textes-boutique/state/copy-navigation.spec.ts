import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { ShopCopyService } from '../data/shop-copy.service';
import { adminView, entryView } from '../shop-copy.testing';
import { COPY_LOCALE_STORAGE_KEY, CopyNavigation } from './copy-navigation';
import { ShopCopyStore } from './shop-copy-store';

async function navigation(): Promise<CopyNavigation> {
  const view = adminView([
    entryView('cart.title', 'cart', 'Votre panier', { locales: { en: { original: 'Basket' } } }),
  ]);
  TestBed.configureTestingModule({
    providers: [
      ShopCopyStore,
      CopyNavigation,
      { provide: ShopCopyService, useValue: { load: () => Promise.resolve(view) } },
      { provide: NotifyService, useValue: { error: vi.fn() } },
      { provide: PermissionsStore, useValue: { can: (_: StaffPermission) => true } },
    ],
  });
  await TestBed.inject(ShopCopyStore).load();
  return TestBed.inject(CopyNavigation);
}

describe('CopyNavigation — la langue affichée', () => {
  afterEach(() => localStorage.removeItem(COPY_LOCALE_STORAGE_KEY));

  it('part du français, et se souvient du choix', async () => {
    const first = await navigation();
    expect(first.locale()).toBe('fr');
    first.setLocale('it');
    expect(localStorage.getItem(COPY_LOCALE_STORAGE_KEY)).toBe('it');
    TestBed.resetTestingModule();
    expect((await navigation()).locale()).toBe('it');
  });

  it('ignore une langue inconnue', async () => {
    const nav = await navigation();
    nav.setLocale('de');
    expect(nav.locale()).toBe('fr');
  });

  it('cherche dans la langue affichée', async () => {
    const nav = await navigation();
    nav.query.set('basket');
    expect(nav.resultCount()).toBe(0);
    nav.setLocale('en');
    expect(nav.resultCount()).toBe(1);
  });
});
