import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FoldPanelRef, provideFoldInlineConfirmLabels } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { CatalogueApi, type Category } from '../catalogue-api';
import { CategoryPanel } from '../category-panel/category-panel';

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat_1',
    name: { fr: 'Viennoiseries' },
    slug: { fr: 'viennoiseries' },
    parentId: null,
    position: 0,
    isArchived: false,
    channelPreset: {
      b1: { emporter: true, surPlace: false },
      b2: { emporter: false, surPlace: false },
      b2b: false,
    },
    emporterTvaId: 'tva_55',
    surPlaceTvaId: '',
    b2bTvaId: '',
    activeProductCount: 0,
    ...overrides,
  };
}

function setup(cat: Category): {
  host: HTMLElement;
  api: CatalogueApi;
  closed: unknown[];
  detect: () => void;
  stable: () => Promise<unknown>;
} {
  const closed: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      // Le panneau renvoie vers « Taux de TVA » — un `routerLink` a besoin
      // d'une route, même vide.
      provideRouter([]),
      // Les mêmes libellés qu'en production : les défauts de fold sont anglais,
      // et c'est exactement ce que ce test doit empêcher de revenir.
      provideFoldInlineConfirmLabels({ confirm: 'Confirmer', cancel: 'Annuler' }),
      { provide: FoldPanelRef, useValue: { close: (v: unknown) => closed.push(v) } },
    ],
  });
  const fixture = TestBed.createComponent(CategoryPanel);
  fixture.componentRef.setInput('data', { category: cat, rates: [] });
  fixture.detectChanges();
  return {
    host: fixture.nativeElement as HTMLElement,
    api: TestBed.inject(CatalogueApi),
    closed,
    detect: () => fixture.detectChanges(),
    stable: () => fixture.whenStable(),
  };
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (found === undefined) {
    throw new Error(`Bouton « ${label} » introuvable.`);
  }
  return found;
}

describe('CategoryPanel — la zone dangereuse', () => {
  it("explique le refus AVANT le clic, et n'offre AUCUNE action", () => {
    // Le domaine refuse (invariant 5). Sans le compte, l'écran ne pouvait que
    // tenter et rendre l'erreur après coup. Sans `actionLabel`, `fold-danger-zone`
    // reste un cadre qui explique — pas un bouton dont on sait qu'il échouera.
    const { host } = setup(category({ activeProductCount: 3 }));

    expect(host.textContent).toContain('Archivage impossible');
    expect(host.textContent).toContain('3 fiche(s) active(s)');
    expect(() => button(host, 'Archiver la famille')).toThrow();
  });

  it("n'offre l'archivage que lorsque la famille est vide", () => {
    const { host } = setup(category({ activeProductCount: 0 }));

    expect(host.textContent).not.toContain('Archivage impossible');
    expect(button(host, 'Archiver la famille')).toBeTruthy();
  });

  it("n'archive PAS au premier clic — il révèle une confirmation, en français", async () => {
    // Deux choses en un geste. La zone dangereuse ne fait qu'ouvrir : c'est
    // toute sa valeur. Et sa confirmation parle français — les défauts de fold
    // sont « Confirm / Cancel », au moment précis où il faut être compris.
    const { host, api, detect, stable } = setup(category());
    const archive = vi.spyOn(api, 'archiveCategory').mockResolvedValue();

    button(host, 'Archiver la famille').click();
    detect();
    await stable();

    expect(archive).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Confirmer');
    expect(host.textContent).not.toContain('Confirm ');

    button(host, 'Confirmer').click();
    detect();
    await stable();

    expect(archive).toHaveBeenCalledWith('cat_1');
  });

  it('ne propose rien à archiver sur une famille déjà archivée', () => {
    const { host } = setup(category({ isArchived: true }));

    expect(() => button(host, 'Archiver cette famille')).toThrow();
  });
});

describe('CategoryPanel — enregistrer', () => {
  it('envoie les trois réglages en une fois, puis ferme', async () => {
    // Ils partaient à chaque frappe : trois requêtes pour une hésitation sur un
    // taux, et aucun moyen d'annuler.
    const { host, api, closed, stable } = setup(category());
    const channels = vi.spyOn(api, 'setCategoryChannelPreset').mockResolvedValue();
    const tva = vi.spyOn(api, 'setCategoryTva').mockResolvedValue();
    const rename = vi.spyOn(api, 'renameCategory').mockResolvedValue();

    button(host, 'Enregistrer').click();
    await stable();

    expect(channels).toHaveBeenCalledTimes(1);
    expect(tva).toHaveBeenCalledTimes(1);
    // Le nom n'a pas changé : on ne renomme pas pour rien.
    expect(rename).not.toHaveBeenCalled();
    expect(closed).toHaveLength(1);
  });
});

describe('CategoryPanel — un taux par canal vendu', () => {
  function channels(over: Partial<Category['channelPreset']> = {}): Category['channelPreset'] {
    return {
      b1: { emporter: false, surPlace: false },
      b2: { emporter: false, surPlace: false },
      b2b: false,
      ...over,
    };
  }

  it("ne propose aucun taux tant qu'aucun canal n'est coché", () => {
    const { host } = setup(category({ channelPreset: channels() }));

    expect(host.textContent).toContain('Cochez un canal');
    expect(host.querySelectorAll('fold-listbox')).toHaveLength(0);
  });

  /** Les libellés des listes de taux — PAS le texte de la page : la matrice de
   *  canaux affiche elle aussi une colonne « Sur place ». */
  function rateLabels(host: HTMLElement): string[] {
    const pickers = host.querySelector('.tva-pickers');
    return [...(pickers?.querySelectorAll('fold-listbox') ?? [])].map((box) =>
      (box.getAttribute('label') ?? box.textContent ?? '').trim(),
    );
  }

  it('ne montre que les taux des canaux vendus', () => {
    const { host } = setup(
      category({ channelPreset: channels({ b1: { emporter: true, surPlace: false } }) }),
    );

    expect(rateLabels(host)).toHaveLength(1);
    expect(rateLabels(host)[0]).toContain('emporter');
  });

  it('montre le taux B2B dès que la plateforme est cochée', () => {
    const { host } = setup(category({ channelPreset: channels({ b2b: true }) }));

    expect(rateLabels(host)).toHaveLength(1);
    expect(rateLabels(host)[0]).toContain('B2B');
  });

  it('montre les trois quand tout est vendu', () => {
    const { host } = setup(
      category({
        channelPreset: channels({
          b1: { emporter: true, surPlace: true },
          b2b: true,
        }),
      }),
    );

    expect(rateLabels(host)).toHaveLength(3);
  });

  it("EFFACE le taux d'un canal qu'on ne vend pas", async () => {
    // Le garder laisserait la famille pointer un taux dont personne ne se sert :
    // le compte d'usages de l'écran des taux le compterait, et la base
    // refuserait de supprimer un taux que plus rien ne facture.
    const { host, api, stable } = setup(
      category({
        channelPreset: channels({ b2b: true }),
        emporterTvaId: 'tva_55',
        surPlaceTvaId: 'tva_10',
        b2bTvaId: 'tva_20',
      }),
    );
    const tva = vi.spyOn(api, 'setCategoryTva').mockResolvedValue();
    vi.spyOn(api, 'setCategoryChannelPreset').mockResolvedValue();

    button(host, 'Enregistrer').click();
    await stable();

    expect(tva).toHaveBeenCalledWith('cat_1', { emporter: '', surPlace: '', b2b: 'tva_20' });
  });
});
