import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { CategoriesPage } from '../categories-page/categories-page';
import { CategoryHttpApi } from '../category-http-api';
import { PointOfSaleHttpApi } from '../../points-of-sale/point-of-sale-http-api';
import { VatRateHttpApi } from '../vat-rates/vat-http-api';
import type { Category } from '../../data/models';

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat_1',
    name: { fr: 'Viennoiseries' },
    slug: { fr: 'viennoiseries' },
    parentId: null,
    position: 0,
    isArchived: false,
    channelPreset: [],
    vatByContext: {},
    activeProductCount: 0,
    ...overrides,
  };
}

/** Le rendu, et de quoi le RELANCER : basculer une langue demande un second tour. */
interface Rendered {
  readonly host: HTMLElement;
  /** Les navigations demandées — la page ouvre une famille en naviguant. */
  readonly routed: unknown[][];
  readonly detect: () => void;
}

async function render(rows: Category[]): Promise<Rendered> {
  const routed: unknown[][] = [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideRouter([]),
      { provide: CategoryHttpApi, useValue: { list: async () => rows } },
      { provide: VatRateHttpApi, useValue: { list: async () => [] } },
      { provide: PointOfSaleHttpApi, useValue: { list: async () => [] } },
    ],
  });
  // Le VRAI routeur, espionné. Le remplacer casse `provideRouter` — son
  // `rootRoute` lit l'instance réelle — et la page en a besoin pour ses
  // `routerLink`.
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(
    (commands: readonly unknown[]) => {
      routed.push([...commands]);
      return Promise.resolve(true);
    },
  );
  const fixture = TestBed.createComponent(CategoriesPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    host: fixture.nativeElement as HTMLElement,
    routed,
    detect: () => fixture.detectChanges(),
  };
}

/** Le texte de chaque ligne rendue par le tableau. */
function rows(host: HTMLElement): string[] {
  return [...host.querySelectorAll('tbody tr')].map((row) =>
    (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('CategoriesPage — les archivées', () => {
  it('les masque par défaut', async () => {
    const { host } = await render([
      category(),
      category({ id: 'cat_2', name: { fr: 'Anciennes' }, isArchived: true }),
    ]);

    expect(rows(host)).toHaveLength(1);
    expect(rows(host)[0]).toContain('Viennoiseries');
    expect(rows(host)[0]).not.toContain('Anciennes');
  });

  it("n'offre l'œil que s'il y a quelque chose à rappeler", async () => {
    const { host } = await render([category()]);

    expect(host.querySelectorAll('fold-toggle-icon')).toHaveLength(0);
  });

  it("le vide ne ment pas : il dit que des archivées attendent derrière l'œil", async () => {
    // « Aucune catégorie » inviterait à en créer une alors qu'il y en a — et
    // que la page en cache l'unique exemplaire.
    const { host } = await render([category({ isArchived: true })]);

    expect(host.textContent).toContain('Aucune famille active');
    expect(host.textContent).not.toContain('Commencez par');
  });
});

describe('CategoriesPage — la langue de lecture', () => {
  /** Le segment du sélecteur, par son libellé. */
  function lang(root: HTMLElement, code: string): HTMLButtonElement {
    const found = [...root.querySelectorAll<HTMLButtonElement>('app-lang-switch .vt-btn')].find(
      (b) => (b.textContent ?? '').trim() === code,
    );
    if (found === undefined) {
      throw new Error(`Langue « ${code} » absente du sélecteur.`);
    }
    return found;
  }

  const traduite = category({
    id: 'cat_2',
    name: { fr: 'Pains', en: 'Breads', it: 'Pane' },
    slug: { fr: 'pains' },
  });

  it('lit les noms dans la langue choisie', async () => {
    const { host, detect } = await render([traduite]);
    expect(rows(host)[0]).toContain('Pains');

    lang(host, 'IT').click();
    detect();

    expect(rows(host)[0]).toContain('Pane');
    expect(rows(host)[0]).not.toContain('Pains');
  });

  it('marque les lignes qui retombent sur le français', async () => {
    // Sans marque, une ligne traduite et une ligne non traduite sont le MÊME
    // texte à l'écran : basculer le sélecteur semblerait sans effet.
    const { host, detect } = await render([category(), traduite]);

    lang(host, 'EN').click();
    detect();

    const viennoiseries = rows(host).find((row) => row.includes('Viennoiseries'));
    const breads = rows(host).find((row) => row.includes('Breads'));
    expect(viennoiseries).toContain('anglais à remplir');
    expect(breads).not.toContain('à remplir');
  });

  /** L'avertissement posé au-dessus du tableau, s'il y en a un. */
  function avertissement(host: HTMLElement): string | null {
    const callout = host.querySelector('fold-callout');
    return callout === null ? null : (callout.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  it('compte, au-dessus du tableau, la famille non traduite', async () => {
    const { host } = await render([category(), traduite]);
    expect(avertissement(host)).toContain('Une famille');
  });

  it('accorde le compte au pluriel', async () => {
    const { host } = await render([category(), category({ id: 'cat_9', name: { fr: 'Tartes' } })]);
    expect(avertissement(host)).toContain('2 familles');
  });

  it('se tait quand tout est traduit', async () => {
    const { host } = await render([traduite]);
    expect(avertissement(host)).toBeNull();
  });

  it('ne compte pas les archivées qu’on ne montre pas', async () => {
    // Le compte porte sur ce qui est AFFICHÉ : annoncer une famille non
    // traduite qu'on ne peut pas voir n'appelle aucun geste.
    const { host } = await render([traduite, category({ id: 'cat_3', isArchived: true })]);
    expect(avertissement(host)).toBeNull();
  });
});

describe('CategoriesPage — les canaux par défaut', () => {
  it('affiche la pastille B2B d’une famille vendue en B2B', async () => {
    // Le gabarit lisait `channelPreset.b2b` — une propriété sur un TABLEAU
    // depuis que la matrice est une liste de paires, donc toujours `undefined`.
    // La pastille ne s'affichait jamais, et une famille vendue uniquement en
    // B2B se lisait « Aucun canal ». Le typage ne l'a pas vu : le contexte d'un
    // `ng-template` est `any`.
    const { host } = await render([
      category({ channelPreset: [{ pointOfSaleId: 'pos_b2b', context: 'b2b' }] }),
    ]);

    expect(rows(host)[0]).toContain('B2B');
    expect(rows(host)[0]).not.toContain('Aucun canal');
  });
});

describe('CategoriesPage — ouvrir une famille', () => {
  it('la LIGNE entière ouvre la page, pas seulement les trois points', async () => {
    // `clickable` de fold fait de la ligne la commande : elle prend le focus et
    // répond à Entrée. Le gabarit portait un `<button>` maison dans la dernière
    // colonne — une cible de la taille de trois points, sur une ligne large
    // comme l'écran.
    const { host, routed } = await render([category()]);

    const row = host.querySelector('tbody tr');
    expect(row).not.toBeNull();
    (row as HTMLElement).click();

    expect(routed).toContainEqual(['/pim/categories', 'cat_1']);
  });

  it("n'imbrique AUCUN bouton dans la ligne cliquable", async () => {
    // Un contrôle dans un contrôle, c'est deux cibles pour un seul geste — et un
    // lecteur d'écran qui annonce le bouton en oubliant la ligne.
    const { host } = await render([category()]);

    const row = host.querySelector('tbody tr');
    expect(row?.querySelectorAll('button')).toHaveLength(0);
  });
});
