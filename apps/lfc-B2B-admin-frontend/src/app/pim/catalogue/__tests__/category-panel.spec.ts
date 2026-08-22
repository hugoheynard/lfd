import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FoldPanelRef, provideFoldInlineConfirmLabels } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { CatalogueApi, type Category } from '../catalogue-api';
import { CategoryPanel, type CategoryPanelData } from '../category-panel/category-panel';

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat_1',
    name: { fr: 'Viennoiseries' },
    slug: { fr: 'viennoiseries' },
    parentId: null,
    position: 0,
    isArchived: false,
    channelPreset: {
      boutiques: {
        emp_village: { emporter: true, surPlace: false },
        emp_val: { emporter: false, surPlace: false },
      },
      b2b: false,
    },
    emporterTvaId: 'tva_55',
    surPlaceTvaId: '',
    b2bTvaId: '',
    activeProductCount: 0,
    ...overrides,
  };
}

interface Mounted {
  host: HTMLElement;
  api: CatalogueApi;
  closed: unknown[];
  detect: () => void;
  stable: () => Promise<unknown>;
}

function setup(cat: Category): Mounted {
  return mount({ category: cat, rates: [] });
}

/** Sans `category` dans la charge, le panneau crée. */
function setupCreate(): Mounted {
  return mount({ rates: [] });
}

function mount(data: CategoryPanelData): Mounted {
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
  fixture.componentRef.setInput('data', data);
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
  /** Une grille vide ; `boutiques` porte des IDENTIFIANTS d'emplacement. */
  function channels(over: Partial<Category['channelPreset']> = {}): Category['channelPreset'] {
    return { boutiques: {}, b2b: false, ...over };
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
      category({
        channelPreset: channels({
          boutiques: { emp_village: { emporter: true, surPlace: false } },
        }),
      }),
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
          boutiques: { emp_village: { emporter: true, surPlace: true } },
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

describe('CategoryPanel — création', () => {
  /** Écrit dans le champ « Nom » comme le ferait une frappe. */
  function type(host: HTMLElement, value: string): void {
    const input = host.querySelector('fold-input input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Champ « Nom » introuvable.');
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('sans famille, le panneau se présente comme une création', () => {
    const { host } = setupCreate();

    expect(host.textContent).toContain('Nouvelle famille');
    expect(() => button(host, 'Créer la famille')).not.toThrow();
    // Rien à archiver : la zone dangereuse n'a pas de sujet.
    expect(host.querySelectorAll('fold-danger-zone')).toHaveLength(0);
  });

  /** Les libellés des listes déroulantes du panneau. */
  function boxes(host: HTMLElement): string[] {
    return [...host.querySelectorAll('fold-listbox')].map((box) => box.getAttribute('label') ?? '');
  }

  it('propose un parent en création', () => {
    expect(boxes(setupCreate().host)).toContain('Parent');
  });

  it('ne propose PAS de parent en édition', () => {
    // Le front n'appelle pas `PUT :id/parent` (qui existe pourtant côté
    // référentiel) : le montrer offrirait un réglage que rien n'enregistrerait.
    expect(boxes(setup(category()).host)).not.toContain('Parent');
  });

  it('crée, puis pose canaux et taux SUR LA FAMILLE CRÉÉE, puis ferme', async () => {
    // Le formulaire qu'il remplace ne savait que le nom et le parent : toute
    // famille naissait sans canaux ni taux, à finir dans un second écran.
    const { host, api, closed, detect, stable } = setupCreate();
    const create = vi.spyOn(api, 'createCategory').mockResolvedValue({ id: 'cat_neuve' });
    const channels = vi.spyOn(api, 'setCategoryChannelPreset').mockResolvedValue();
    const tva = vi.spyOn(api, 'setCategoryTva').mockResolvedValue();

    type(host, 'Glaces');
    detect();
    button(host, 'Créer la famille').click();
    await stable();

    expect(create).toHaveBeenCalledWith({ nameFr: 'Glaces' });
    expect(channels.mock.calls[0]?.[0]).toBe('cat_neuve');
    expect(tva.mock.calls[0]?.[0]).toBe('cat_neuve');
    expect(closed).toHaveLength(1);
  });

  it('reste désarmé tant que le nom est vide', () => {
    const { host } = setupCreate();

    expect(button(host, 'Créer la famille').disabled).toBe(true);
  });
});
