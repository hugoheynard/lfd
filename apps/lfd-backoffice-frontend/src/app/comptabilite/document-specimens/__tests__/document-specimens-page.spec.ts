import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpecimenKey } from '../../document-specimen-catalogue';
import { DocumentSpecimensService } from '../../document-specimens.service';
import { DocumentSpecimensPage } from '../document-specimens-page';

/** Le serveur doublé : un PDF par exemplaire, ou un refus pour ceux qu'on nomme. */
class Specimens {
  readonly asked: SpecimenKey[] = [];

  constructor(private readonly failing: readonly SpecimenKey[] = []) {}

  async pdf(key: SpecimenKey): Promise<Blob> {
    this.asked.push(key);
    if (this.failing.includes(key)) {
      throw new Error('500');
    }
    return new Blob(['%PDF-'], { type: 'application/pdf' });
  }
}

async function mount(api: Specimens): Promise<DocumentSpecimensPage> {
  TestBed.configureTestingModule({
    providers: [{ provide: DocumentSpecimensService, useValue: api }],
  });
  const page = TestBed.runInInjectionContext(() => new DocumentSpecimensPage());
  await page['load']();
  return page;
}

describe('la planche des documents', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:exemple');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('montre le bon pro à l’ouverture', async () => {
    const api = new Specimens();
    const page = await mount(api);

    expect(api.asked.at(-1)).toBe('order-sheet-pro');
    expect(page['state']()).toBe('ready');
    expect(page['source']()).not.toBeNull();
  });

  it('range les quinze exemplaires en huit groupes', async () => {
    const page = await mount(new Specimens());

    expect(page['groups'].map((group) => group.title)).toEqual([
      'Bons chiffrés',
      'Bons non chiffrés',
      'Fournil',
      'Factures',
      'Mandats',
      'Récapitulatifs',
      'Catalogue',
      'Étiquettes',
    ]);
    expect(page['groups'].flatMap((group) => group.options).length).toBe(16);
  });

  it('charge l’exemplaire choisi et révoque l’URL précédente', async () => {
    const api = new Specimens();
    const page = await mount(api);

    page['choose']('invoice');
    await page['load']();

    expect(api.asked).toContain('invoice');
    expect(page['label']()).toBe('Facture Factur-X');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:exemple');
  });

  it('ignore une clé inconnue', async () => {
    const api = new Specimens();
    const page = await mount(api);
    const before = api.asked.length;

    page['choose']('bon-staff');

    expect(page['selected']()).toBe('order-sheet-pro');
    expect(api.asked.length).toBe(before);
  });

  it('dit l’échec du rendu, sans aperçu', async () => {
    const page = await mount(new Specimens(['order-sheet-pro']));

    expect(page['state']()).toBe('error');
    expect(page['source']()).toBeNull();
  });

  it('propose de télécharger quand le navigateur bloque l’onglet', async () => {
    const page = await mount(new Specimens());
    vi.spyOn(window, 'open').mockReturnValue(null);

    page['openInTab']();

    expect(page['tabBlocked']()).toBe(true);
  });
});
