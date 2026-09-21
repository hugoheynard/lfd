import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UiPrefsStore } from './ui-prefs.store';

/** Une instance NEUVE à chaque appel : c'est le stockage qu'on teste, pas la
 *  mémoire d'un objet — un singleton réutilisé passerait le test sans rien
 *  écrire nulle part. */
function store(): UiPrefsStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(UiPrefsStore);
}

describe('UiPrefsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rend le défaut tant que rien n’a été choisi', () => {
    const s = store();
    expect(s.isOpen('écran', 'identite', true)).toBe(true);
    expect(s.isOpen('écran', 'identite', false)).toBe(false);
  });

  it('retient un choix, et le rend d’une instance à l’autre', () => {
    store().setOpen('écran', 'identite', false);
    // Une seconde instance : c'est bien le STOCKAGE qui porte la valeur, pas
    // l'objet — sans quoi le test passerait sur une mémoire de session.
    expect(store().isOpen('écran', 'identite', true)).toBe(false);
  });

  it('sépare les espaces de noms — deux écrans ne partagent pas leurs plis', () => {
    const s = store();
    s.setOpen('produit', 'identite', false);
    expect(s.isOpen('famille', 'identite', true)).toBe(true);
  });

  it('repart des défauts sur un sac illisible plutôt que de propager la forme', () => {
    localStorage.setItem('lfc.admin.ui-prefs', '["pas", "un", "objet"]');
    expect(store().isOpen('écran', 'identite', true)).toBe(true);
  });

  it('survit à un stockage qui refuse d’écrire', () => {
    // Navigation privée, quota, politique d'entreprise : une préférence
    // d'affichage ne doit JAMAIS casser une page.
    const s = store();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => s.setOpen('écran', 'identite', false)).not.toThrow();
    setItem.mockRestore();
  });

  it('survit à un stockage qui refuse de LIRE', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqué');
    });
    expect(store().isOpen('écran', 'identite', true)).toBe(true);
    getItem.mockRestore();
  });
});
