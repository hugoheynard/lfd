import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_METRICS, MAX_PINNED, PinnedAccountsStore } from '../pinned-store';

const STORAGE_KEY = 'lfc.admin.cockpit.pinned';

/** Les identifiants seuls — ce que la plupart des cas veulent affirmer. */
function ids(pins: PinnedAccountsStore): readonly string[] {
  return pins.pinned().map((account) => account.companyId);
}

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
    expect(ids(pins)).toEqual(['cmp_b', 'cmp_a']);
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
    const pins = store();
    pins.toggle('cmp_1');
    pins.addMetric('cmp_1', 'orders');
    // Les indicateurs suivent l'épingle : sinon la carte se vide à chaque visite.
    expect(store().metricsOf('cmp_1')).toEqual(['orders']);
  });

  it('ne casse PAS sur un contenu étranger — un JSON tiers ne doit rien faire tomber', () => {
    localStorage.setItem(STORAGE_KEY, '{"pas":"un tableau"}');
    expect(store().pinned()).toEqual([]);

    localStorage.setItem(STORAGE_KEY, 'ceci n’est pas du JSON');
    expect(store().pinned()).toEqual([]);

    localStorage.setItem(STORAGE_KEY, '["cmp_1", 42, null]');
    expect(ids(store())).toEqual(['cmp_1']);
  });

  it("relit l'ANCIENNE forme (de simples identifiants) sans perdre les épingles", () => {
    // Le format a gagné les indicateurs après coup : un utilisateur qui avait
    // déjà épinglé des comptes doit les retrouver, sans migration à écrire.
    localStorage.setItem(STORAGE_KEY, '["cmp_1","cmp_2"]');
    const pins = store();
    expect(ids(pins)).toEqual(['cmp_1', 'cmp_2']);
    expect(pins.metricsOf('cmp_1')).toEqual([]);
  });
});

describe("les indicateurs d'une carte", () => {
  beforeEach(() => localStorage.clear());

  it("s'ajoutent, dans l'ordre, et ne se dupliquent pas", () => {
    const pins = store();
    pins.toggle('cmp_1');
    expect(pins.addMetric('cmp_1', 'orders')).toBe(true);
    expect(pins.addMetric('cmp_1', 'total_spent')).toBe(true);
    expect(pins.addMetric('cmp_1', 'orders')).toBe(false);
    expect(pins.metricsOf('cmp_1')).toEqual(['orders', 'total_spent']);
  });

  it("REFUSENT au-delà de la limite — une carte n'est pas un tableau", () => {
    const pins = store();
    pins.toggle('cmp_1');
    for (let i = 0; i < MAX_METRICS; i += 1) {
      expect(pins.addMetric('cmp_1', `m_${i}`)).toBe(true);
    }
    expect(pins.addMetric('cmp_1', 'de_trop')).toBe(false);
  });

  it("ne s'ajoutent PAS à un compte qui n'est pas épinglé", () => {
    expect(store().addMetric('cmp_inconnu', 'orders')).toBe(false);
  });

  it('se retirent', () => {
    const pins = store();
    pins.toggle('cmp_1');
    pins.addMetric('cmp_1', 'orders');
    pins.removeMetric('cmp_1', 'orders');
    expect(pins.metricsOf('cmp_1')).toEqual([]);
  });
});
