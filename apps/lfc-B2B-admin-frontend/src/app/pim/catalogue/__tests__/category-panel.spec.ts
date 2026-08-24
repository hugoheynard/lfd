import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FoldPanelRef, provideFoldInlineConfirmLabels } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import type { Category } from '../catalogue-api';
import { CategoryHttpApi } from '../category-http-api';
import { CategoryStore } from '../category-store';
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

/**
 * On espionne la couche HTTP, pas une façade : ce sont les REQUÊTES qui
 * comptent — leur nombre, leur ordre et ce qu'elles portent. C'est aussi ce qui
 * rend visible la relecture unique, invisible un cran plus haut.
 */
interface HttpSpy {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  move: ReturnType<typeof vi.fn>;
  setChannels: ReturnType<typeof vi.fn>;
  setTva: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
}

interface Mounted {
  host: HTMLElement;
  http: HttpSpy;
  closed: unknown[];
  detect: () => void;
  stable: () => Promise<unknown>;
}

/**
 * **`await` obligatoire** : le store charge sa liste dans son constructeur, et
 * un panneau monté avant que cette liste soit revenue ne peut rien comparer.
 * Des assertions « il n'a rien écrit puisque rien n'a changé » passaient ici
 * pour une tout autre raison — la liste était vide, donc la comparaison ne
 * répondait jamais oui.
 */
async function setup(cat: Category): Promise<Mounted> {
  return mount({ category: cat, rates: [] });
}

/** Sans `category` dans la charge, le panneau crée. */
async function setupCreate(): Promise<Mounted> {
  return mount({ rates: [] });
}

async function mount(data: CategoryPanelData): Promise<Mounted> {
  const closed: unknown[] = [];
  const known = data.category === undefined ? [] : [data.category];
  const http: HttpSpy = {
    list: vi.fn(async () => known),
    create: vi.fn(async () => ({ id: 'cat_neuve' })),
    rename: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined),
    setChannels: vi.fn(async () => undefined),
    setTva: vi.fn(async () => undefined),
    archive: vi.fn(async () => undefined),
  };
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
      { provide: CategoryHttpApi, useValue: http },
    ],
  });
  // La liste du store, revenue AVANT le montage : le panneau la lit.
  await TestBed.inject(CategoryStore).reload();
  const fixture = TestBed.createComponent(CategoryPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return {
    host: fixture.nativeElement as HTMLElement,
    http,
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
  it("explique le refus AVANT le clic, et n'offre AUCUNE action", async () => {
    // Le domaine refuse (invariant 5). Sans le compte, l'écran ne pouvait que
    // tenter et rendre l'erreur après coup. Sans `actionLabel`, `fold-danger-zone`
    // reste un cadre qui explique — pas un bouton dont on sait qu'il échouera.
    const { host } = await setup(category({ activeProductCount: 3 }));

    expect(host.textContent).toContain('Archivage impossible');
    expect(host.textContent).toContain('3 fiche(s) active(s)');
    expect(() => button(host, 'Archiver la famille')).toThrow();
  });

  it("n'offre l'archivage que lorsque la famille est vide", async () => {
    const { host } = await setup(category({ activeProductCount: 0 }));

    expect(host.textContent).not.toContain('Archivage impossible');
    expect(button(host, 'Archiver la famille')).toBeTruthy();
  });

  it("n'archive PAS au premier clic — il révèle une confirmation, en français", async () => {
    // Deux choses en un geste. La zone dangereuse ne fait qu'ouvrir : c'est
    // toute sa valeur. Et sa confirmation parle français — les défauts de fold
    // sont « Confirm / Cancel », au moment précis où il faut être compris.
    const { host, http, detect, stable } = await setup(category());
    const archive = http.archive;

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

  it('ne propose rien à archiver sur une famille déjà archivée', async () => {
    const { host } = await setup(category({ isArchived: true }));

    expect(() => button(host, 'Archiver cette famille')).toThrow();
  });
});

describe('CategoryPanel — enregistrer', () => {
  it('envoie les réglages en une fois, puis ferme', async () => {
    // Ils partaient à chaque frappe : trois requêtes pour une hésitation sur un
    // taux, et aucun moyen d'annuler.
    const { host, http, closed, stable } = await setup(category());

    button(host, 'Enregistrer').click();
    await stable();

    expect(http.setChannels).toHaveBeenCalledTimes(1);
    expect(http.setTva).toHaveBeenCalledTimes(1);
    // Ni le nom ni le parent n'ont changé : on n'écrit pas pour rien.
    expect(http.rename).not.toHaveBeenCalled();
    expect(http.move).not.toHaveBeenCalled();
    expect(closed).toHaveLength(1);
  });
});

describe('CategoryPanel — un taux par canal vendu', () => {
  /** Une grille vide ; `boutiques` porte des IDENTIFIANTS d'emplacement. */
  function channels(over: Partial<Category['channelPreset']> = {}): Category['channelPreset'] {
    return { boutiques: {}, b2b: false, ...over };
  }

  it("ne propose aucun taux tant qu'aucun canal n'est coché", async () => {
    const { host } = await setup(category({ channelPreset: channels() }));

    expect(host.textContent).toContain('Cochez un canal');
    // Dans `.tva-pickers` uniquement : « Parent » est une liste lui aussi, et
    // il n'a rien à voir avec les taux.
    expect(host.querySelectorAll('.tva-pickers fold-listbox')).toHaveLength(0);
  });

  /** Les libellés des listes de taux — PAS le texte de la page : la matrice de
   *  canaux affiche elle aussi une colonne « Sur place ». */
  function rateLabels(host: HTMLElement): string[] {
    const pickers = host.querySelector('.tva-pickers');
    return [...(pickers?.querySelectorAll('fold-listbox') ?? [])].map((box) =>
      (box.getAttribute('label') ?? box.textContent ?? '').trim(),
    );
  }

  it('ne montre que les taux des canaux vendus', async () => {
    const { host } = await setup(
      category({
        channelPreset: channels({
          boutiques: { emp_village: { emporter: true, surPlace: false } },
        }),
      }),
    );

    expect(rateLabels(host)).toHaveLength(1);
    expect(rateLabels(host)[0]).toContain('emporter');
  });

  it('montre le taux B2B dès que la plateforme est cochée', async () => {
    const { host } = await setup(category({ channelPreset: channels({ b2b: true }) }));

    expect(rateLabels(host)).toHaveLength(1);
    expect(rateLabels(host)[0]).toContain('B2B');
  });

  it('montre les trois quand tout est vendu', async () => {
    const { host } = await setup(
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
    const { host, http, stable } = await setup(
      category({
        channelPreset: channels({ b2b: true }),
        emporterTvaId: 'tva_55',
        surPlaceTvaId: 'tva_10',
        b2bTvaId: 'tva_20',
      }),
    );

    button(host, 'Enregistrer').click();
    await stable();

    // La CHARGE remise au transport ; c'est lui qui traduit `''` en `null`.
    expect(http.setTva).toHaveBeenCalledWith('cat_1', {
      emporter: '',
      surPlace: '',
      b2b: 'tva_20',
    });
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

  it('sans famille, le panneau se présente comme une création', async () => {
    const { host } = await setupCreate();

    expect(host.textContent).toContain('Nouvelle famille');
    expect(() => button(host, 'Créer la famille')).not.toThrow();
    // Rien à archiver : la zone dangereuse n'a pas de sujet.
    expect(host.querySelectorAll('fold-danger-zone')).toHaveLength(0);
  });

  /** Les libellés des listes déroulantes du panneau. */
  function boxes(host: HTMLElement): string[] {
    return [...host.querySelectorAll('fold-listbox')].map((box) => box.getAttribute('label') ?? '');
  }

  it('propose un parent en création', async () => {
    expect(boxes((await setupCreate()).host)).toContain('Parent');
  });

  it('crée, puis pose canaux et taux SUR LA FAMILLE CRÉÉE, puis ferme', async () => {
    // Le formulaire qu'il remplace ne savait que le nom et le parent : toute
    // famille naissait sans canaux ni taux, à finir dans un second écran.
    const { host, http, closed, detect, stable } = await setupCreate();

    type(host, 'Glaces');
    detect();
    button(host, 'Créer la famille').click();
    await stable();

    expect(http.create).toHaveBeenCalledWith({ name: { fr: 'Glaces' } });
    expect(http.setChannels.mock.calls[0]?.[0]).toBe('cat_neuve');
    expect(http.setTva.mock.calls[0]?.[0]).toBe('cat_neuve');
    expect(closed).toHaveLength(1);
  });

  it('reste désarmé tant que le nom est vide', async () => {
    const { host } = await setupCreate();

    expect(button(host, 'Créer la famille').disabled).toBe(true);
  });
});

describe('CategoryPanel — déplacer', () => {
  /**
   * `PUT :id/parent` existait côté référentiel — refus de cycle et refus de
   * parent archivé compris, testés — et n'avait aucun appelant. Le champ était
   * réservé à la création faute de verbe côté FRONT, pas faute de verbe.
   */
  function parentBox(host: HTMLElement): Element | undefined {
    return [...host.querySelectorAll('fold-listbox')].find(
      (box) => box.getAttribute('label') === 'Parent',
    );
  }

  it('propose le parent en édition aussi', async () => {
    expect(parentBox((await setup(category())).host)).toBeDefined();
  });

  it('ne se propose pas comme son propre parent', async () => {
    // Le référentiel refuserait (`CategorySelfParentError`) : autant ne pas
    // l'offrir. Les descendantes, elles, restent proposées — le refus de cycle
    // demande l'arbre entier, que le panneau ne voit pas.
    expect(parentBox((await setup(category())).host)?.textContent).not.toContain('Viennoiseries');
  });

  it("n'écrit RIEN quand le parent n'a pas bougé", async () => {
    const { host, http, stable } = await setup(category());

    button(host, 'Enregistrer').click();
    await stable();

    expect(http.move).not.toHaveBeenCalled();
  });
});

describe('CategoryPanel — le coût d’un enregistrement', () => {
  /**
   * Chaque méthode du store relisait la liste entière derrière son écriture :
   * enregistrer coûtait jusqu'à quatre `PUT` et quatre `GET`. L'écran se
   * félicitait de ne plus écrire à chaque frappe, le store lui reprenait ce
   * qu'il avait gagné.
   */
  it('relit la liste UNE fois, pas une fois par écriture', async () => {
    const { host, http, stable } = await setup(category());
    const atStartup = http.list.mock.calls.length;

    button(host, 'Enregistrer').click();
    await stable();

    expect(http.list.mock.calls.length - atStartup).toBe(1);
  });
});

describe('CategoryPanel — une famille archivée est gelée', () => {
  /**
   * Le référentiel refuse ses canaux, ses taux et son déplacement ; seul le
   * renommage passe. Le panneau offrait pourtant le formulaire entier avec un
   * bouton armé : enregistrer écrivait le nom, PUIS échouait sur les canaux —
   * une moitié appliquée et un message d'erreur.
   */
  it('ne montre que le nom, et le dit', async () => {
    const { host } = await setup(category({ isArchived: true }));

    expect(host.querySelectorAll('fold-listbox')).toHaveLength(0);
    expect(host.querySelectorAll('app-channel-matrix')).toHaveLength(0);
    expect(host.textContent).toContain('ses réglages sont gelés');
  });

  it("n'envoie QUE le renommage", async () => {
    const { host, http, detect, stable } = await setup(
      category({ isArchived: true, name: { fr: 'Ancien' } }),
    );
    const input = host.querySelector('fold-input input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('champ Nom introuvable');
    }
    input.value = 'Ancien corrigé';
    input.dispatchEvent(new Event('input'));
    detect();

    button(host, 'Enregistrer').click();
    await stable();

    expect(http.rename).toHaveBeenCalledWith('cat_1', { fr: 'Ancien corrigé' });
    expect(http.setChannels).not.toHaveBeenCalled();
    expect(http.setTva).not.toHaveBeenCalled();
    expect(http.move).not.toHaveBeenCalled();
  });
});
