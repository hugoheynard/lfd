import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_PINNED, PinnedAccountsStore } from '../pinned-store';

const STORAGE_KEY = 'lfc.admin.cockpit.pinned';

function store(): PinnedAccountsStore {
  // Un magasin neuf par test : il lit `localStorage` à la construction.
  TestBed.resetTestingModule();
  return TestBed.inject(PinnedAccountsStore);
}

describe('les comptes épinglés', () => {
  beforeEach(() => localStorage.clear());

  it('part vide', () => {
    expect(store().pinned()).toEqual([]);
  });

  it('épingle, puis retire au second appel', () => {
    const pins = store();
    expect(pins.toggle('cmp_1')).toBe(true);
    expect(pins.isPinned('cmp_1')).toBe(true);

    expect(pins.toggle('cmp_1')).toBe(true);
    expect(pins.pinned()).toEqual([]);
  });

  it("garde l'ordre des épingles — pas celui de la liste serveur", () => {
    const pins = store();
    pins.toggle('cmp_b');
    pins.toggle('cmp_a');
    expect(pins.pinned()).toEqual(['cmp_b', 'cmp_a']);
  });

  it('REFUSE au-delà de la limite, et le dit', () => {
    const pins = store();
    for (let i = 0; i < MAX_PINNED; i += 1) {
      expect(pins.toggle(`cmp_${i}`)).toBe(true);
    }
    // Le refus est explicite : l'appelant peut l'expliquer plutôt que de laisser
    // un clic sans effet.
    expect(pins.toggle('cmp_trop')).toBe(false);
    expect(pins.pinned()).toHaveLength(MAX_PINNED);
  });

  it('survit à un rechargement', () => {
    store().toggle('cmp_1');
    expect(store().pinned()).toEqual(['cmp_1']);
  });

  it('ne casse PAS sur un contenu étranger — un JSON tiers ne doit rien faire tomber', () => {
    localStorage.setItem(STORAGE_KEY, '{"pas":"un tableau"}');
    expect(store().pinned()).toEqual([]);

    localStorage.setItem(STORAGE_KEY, 'ceci n’est pas du JSON');
    expect(store().pinned()).toEqual([]);

    localStorage.setItem(STORAGE_KEY, '["cmp_1", 42, null]');
    expect(store().pinned()).toEqual(['cmp_1']);
  });
});
