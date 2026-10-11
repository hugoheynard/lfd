import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { ShopCopyService } from '../data/shop-copy.service';
import { adminView, entryView } from '../shop-copy.testing';
import {
  COPY_AUDIENCE_STORAGE_KEY,
  COPY_LOCALE_STORAGE_KEY,
  CopyNavigation,
} from './copy-navigation';
import { ShopCopyStore } from './shop-copy-store';

const ENTRIES = [
  entryView('cart.title', 'cart', 'Votre panier', { locales: { en: { original: 'Basket' } } }),
  entryView('nav.home', 'nav', 'Accueil'),
  entryView('loyalty.title', 'loyalty', 'Ma fidélité'),
  entryView('signup.title', 'signup', 'Créer un compte'),
  entryView('slotStep.title', 'slotStep', 'Quand ?'),
];

async function navigation(entries = ENTRIES.slice(0, 1)): Promise<CopyNavigation> {
  const view = adminView(entries);
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

describe('CopyNavigation — la clientèle et ce que l’aperçu montre', () => {
  afterEach(() => localStorage.removeItem(COPY_AUDIENCE_STORAGE_KEY));

  const spaces = (nav: CopyNavigation): readonly string[] => nav.tree().map((node) => node.space);

  it('part de « Non connecté », se souvient du choix, ignore une clientèle inconnue', async () => {
    const first = await navigation(ENTRIES);
    expect(first.audience()).toBe('visitor');
    first.setAudience('pro');
    first.setAudience('martien');
    expect(localStorage.getItem(COPY_AUDIENCE_STORAGE_KEY)).toBe('pro');
    TestBed.resetTestingModule();
    expect((await navigation(ENTRIES)).audience()).toBe('pro');
  });

  it('tant que l’aperçu n’a rien dit, la colonne est vide', async () => {
    const nav = await navigation(ENTRIES);
    expect(nav.mode()).toBe('preview');
    expect(nav.tree()).toEqual([]);
    expect(nav.resultCount()).toBe(0);
  });

  it('suit l’aperçu, dans l’ordre de l’écran, et le compteur suit', async () => {
    const nav = await navigation(ENTRIES);
    nav.setVisibleKeys(['nav.home', 'cart.title']);
    expect(spaces(nav)).toEqual(['nav', 'cart']);
    expect(nav.resultCount()).toBe(2);
    nav.setVisibleKeys(['cart.title']);
    expect(spaces(nav)).toEqual(['cart']);
  });

  it('« Voir tous les textes » : les espaces de la clientèle, puis ceux que personne ne voit', async () => {
    const nav = await navigation(ENTRIES);
    nav.showAll.set(true);
    expect(spaces(nav)).toEqual(['signup', 'cart', 'nav', 'slotStep']);
    expect(nav.unshownTree().map((node) => node.space)).toEqual(['slotStep']);
    nav.setAudience('personal');
    expect(spaces(nav)).toEqual(['cart', 'nav', 'loyalty', 'slotStep']);
  });

  it('la recherche porte sur tous les textes de la clientèle, hors de l’aperçu', async () => {
    const nav = await navigation(ENTRIES);
    nav.setVisibleKeys(['nav.home']);
    nav.query.set('fidélité');
    expect(nav.mode()).toBe('search');
    expect(spaces(nav)).toEqual([]);
    nav.setAudience('personal');
    expect(spaces(nav)).toEqual(['loyalty']);
  });

  it('changer de clientèle oublie la liste de l’aperçu, en attendant la nouvelle', async () => {
    const nav = await navigation(ENTRIES);
    nav.setVisibleKeys(['nav.home']);
    nav.setAudience('pro');
    expect(nav.visibleKeys()).toBeNull();
  });

  it('ouvrir une clé que la colonne ne montre pas ouvre la liste complète', async () => {
    const nav = await navigation(ENTRIES);
    nav.setVisibleKeys(['nav.home']);
    nav.openKey('cart.title');
    expect(nav.mode()).toBe('all');
    expect(nav.currentSpace()?.space).toBe('cart');
  });
});
