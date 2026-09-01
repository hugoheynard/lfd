import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { ProductFormStore } from '../../product-form-store';

/**
 * Ce que la COMPOSITION mentionne, en regard de ce que la fiche DÉCLARE.
 *
 * Le dispositif existait entièrement côté serveur — route, handler, contrat et
 * tests — et aucun écran ne l'appelait : un ingrédient porteur d'un allergène,
 * cité par une fiche qui n'en déclare aucun, ne produisait aucune alerte
 * (audit 2026-09-01, §3). Ces tests tiennent la jonction, et surtout les trois
 * interdits du contrat (D5) que l'écran pourrait lui faire dire.
 */
describe('la composition en regard de la déclaration', () => {
  let store: ProductFormStore;

  /** Le référentiel du catalogue courant — c'est lui qui nomme les codes. */
  const reference = [
    { code: 'milk', label: 'Lait', incoCategory: 'MILK', incoLabel: 'Lait' },
    { code: 'gluten', label: 'Blé', incoCategory: 'GLUTEN', incoLabel: 'Gluten' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ProductFormStore, provideHttpClient()] });
    store = TestBed.inject(ProductFormStore);
    store.entries.set(reference);
  });

  it('ne propose RIEN quand la composition ne mentionne rien', () => {
    expect(store.citedNotDeclared()).toEqual([]);
    expect(store.citedContradictsNone()).toBe(false);
  });

  /**
   * Le cas du beurre : un ingrédient porteur d'un allergène, sur une fiche qui
   * affirme n'en avoir aucun. C'est une CONTRADICTION, pas une suggestion.
   */
  it('crie quand la composition contredit un « aucun allergène »', () => {
    store['citedAllergensValue'].set(['milk']);
    store.declaresNone.set(true);

    expect(store.citedContradictsNone()).toBe(true);
    expect(store.citedNotDeclared().map((choice) => choice.label)).toEqual(['Lait']);
  });

  it('propose ce que la déclaration ne porte pas encore', () => {
    store['citedAllergensValue'].set(['milk', 'gluten']);
    store.selected.set(['gluten']);

    expect(store.citedNotDeclared().map((choice) => choice.code)).toEqual(['milk']);
  });

  it('se tait sur ce qui est déjà déclaré', () => {
    store['citedAllergensValue'].set(['milk']);
    store.selected.set(['milk']);

    expect(store.citedNotDeclared()).toEqual([]);
  });

  /**
   * La portée « UE » n'expose pas tout le référentiel. Un code sans libellé
   * afficherait `en:e220` à un opérateur — on préfère ne rien proposer.
   */
  it('ignore un code que le catalogue courant ne sait pas nommer', () => {
    store['citedAllergensValue'].set(['inconnu']);

    expect(store.citedNotDeclared()).toEqual([]);
  });

  describe('la reprise', () => {
    it('lève « aucun allergène » et coche ce qui est cité', () => {
      store['citedAllergensValue'].set(['milk']);
      store.declaresNone.set(true);

      store.adoptCitedAllergens();

      expect(store.declaresNone()).toBe(false);
      expect(store.selected()).toEqual(['milk']);
      expect(store.citedNotDeclared()).toEqual([]);
    });

    /**
     * Jamais de RETRAIT : un allergène déclaré à la main — contamination
     * croisée d'atelier — n'est pas démenti par une composition qui l'ignore.
     */
    it('n’enlève jamais un allergène que la composition ne mentionne pas', () => {
      store['citedAllergensValue'].set(['milk']);
      store.selected.set(['gluten']);

      store.adoptCitedAllergens();

      expect([...store.selected()].sort()).toEqual(['gluten', 'milk']);
    });

    it('ne double pas un code déjà coché', () => {
      store['citedAllergensValue'].set(['milk', 'gluten']);
      store.selected.set(['milk']);

      store.adoptCitedAllergens();

      expect(store.selected()).toEqual(['milk', 'gluten']);
    });

    it('ne fait rien quand il n’y a rien à reprendre', () => {
      store.selected.set(['gluten']);

      store.adoptCitedAllergens();

      expect(store.selected()).toEqual(['gluten']);
      expect(store.declaresNone()).toBe(false);
    });
  });

  /**
   * Régression : `readinessStale` n'était rafraîchi qu'à l'hydratation et après
   * un geste de cycle de vie. Reprendre les allergènes cités puis enregistrer
   * laissait donc la signature verte, et le rail n'offrait pas « Déclarer à
   * nouveau » — la fiche paraissait signée sur un contenu qu'elle n'avait plus
   * (constaté par Hugo le 2026-09-01, après la tranche 5).
   */
  describe('la signature après un enregistrement', () => {
    it('se périme dès qu’une section de contenu part', async () => {
      store['readinessValue'].set({ readyAt: '2026-08-31T09:00:00.000Z', readyBy: 'staff' });
      store['readinessStaleValue'].set(false);

      await store['save']('fiche', () => Promise.resolve());

      expect(store.readinessStale()).toBe(true);
    });

    it('ne se périme pas quand l’enregistrement échoue', async () => {
      store['readinessValue'].set({ readyAt: '2026-08-31T09:00:00.000Z', readyBy: 'staff' });
      store['readinessStaleValue'].set(false);

      await store['save']('fiche', () => Promise.reject(new Error('boum')));

      expect(store.readinessStale()).toBe(false);
    });

    it('ne parle pas de péremption quand personne n’a signé', async () => {
      await store['save']('fiche', () => Promise.resolve());

      expect(store.readinessStale()).toBe(false);
    });
  });

  /**
   * « Rien à proposer » et « on n'a pas pu regarder » se ressemblent à l'écran
   * et ne veulent pas du tout dire la même chose : la liste d'ingrédients est
   * éditoriale, donc l'absence de proposition est DÉJÀ une absence
   * d'information. Les confondre ferait passer une panne pour une composition
   * sans allergène (D5, interdit n° 1).
   */
  it('distingue une composition muette d’une composition illisible', () => {
    expect(store.citedAllergensUnreadable()).toBe(false);
    store.citedAllergensUnreadable.set(true);
    expect(store.citedNotDeclared()).toEqual([]);
    expect(store.citedAllergensUnreadable()).toBe(true);
  });
});
