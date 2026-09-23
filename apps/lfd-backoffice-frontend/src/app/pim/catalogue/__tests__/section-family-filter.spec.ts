import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ProductSectionFamily, StaffNavPreferencesPatch } from '@lfd/contracts';

import { StaffPrefsService } from '../../../shared/staff-prefs/staff-prefs.service';
import { SectionFamilyFilterStore } from '../section-family-filter';

/**
 * Ce que ces cas tiennent : **le filtre suit la personne, et le choix présent
 * gagne toujours sur le choix mémorisé**.
 *
 * L'hydratation attend le chargement de l'identité : elle arrive donc après le
 * premier rendu, et parfois après un clic. Sans garde, la préférence d'hier
 * écraserait le choix d'il y a deux secondes et l'écran changerait tout seul
 * sous les doigts.
 */

class FakePrefs {
  saved: ProductSectionFamily | null = null;
  written: StaffNavPreferencesPatch[] = [];

  /** Résolue à la main : c'est ce qui permet de cliquer AVANT l'hydratation. */
  private release: (() => void) | null = null;

  async productSectionFamily(): Promise<ProductSectionFamily | null> {
    if (this.release !== null) {
      await new Promise<void>((resolve) => {
        this.release = resolve;
      });
    }
    return this.saved;
  }

  async remember(patch: StaffNavPreferencesPatch): Promise<void> {
    this.written.push(patch);
  }

  hold(): void {
    this.release = (): void => undefined;
  }

  now(): void {
    const release = this.release;
    this.release = null;
    release?.();
  }
}

let prefs: FakePrefs;

function store(): SectionFamilyFilterStore {
  return TestBed.inject(SectionFamilyFilterStore);
}

describe('SectionFamilyFilterStore', () => {
  beforeEach(() => {
    prefs = new FakePrefs();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: StaffPrefsService, useValue: prefs }],
    });
  });

  it('ouvre sur « Tout » quand personne ne s’est jamais prononcé', async () => {
    const filter = store();
    await Promise.resolve();

    expect(filter.family()).toBe('all');
  });

  it('reprend la famille retenue pour cette personne', async () => {
    prefs.saved = 'communication';

    const filter = store();
    await Promise.resolve();

    expect(filter.family()).toBe('communication');
  });

  it('retient le choix, et traduit « Tout » en `null` pour le contrat', () => {
    const filter = store();

    filter.choose('reglementaire');
    filter.choose('all');

    // `'all'` n'existe pas au contrat : le schéma n'admet que les quatre
    // familles ou `null`. La traduction vit dans le magasin, pas ailleurs.
    expect(prefs.written).toEqual([
      { productSectionFamily: 'reglementaire' },
      { productSectionFamily: null },
    ]);
  });

  it('n’envoie QUE sa clé, pour ne pas effacer la préférence voisine', () => {
    store().choose('commerce');

    // Le `.partial()` du contrat achète « clé absente = n'y touche pas ». Un
    // sac complet effacerait `worksheetCategory` au passage.
    expect(Object.keys(prefs.written[0] ?? {})).toEqual(['productSectionFamily']);
  });

  /**
   * Régression : sans le drapeau `chosen`, l'hydratation tardive écrasait un
   * choix déjà fait, et le filtre changeait tout seul sous les doigts.
   */
  it('ne laisse PAS la préférence retenue écraser un choix déjà fait', async () => {
    prefs.saved = 'communication';
    prefs.hold();

    const filter = store();
    filter.choose('identite');
    prefs.now();
    await Promise.resolve();
    await Promise.resolve();

    expect(filter.family()).toBe('identite');
  });
});
