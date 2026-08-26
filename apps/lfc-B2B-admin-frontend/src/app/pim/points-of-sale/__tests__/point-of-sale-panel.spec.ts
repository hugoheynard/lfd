import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { PointOfSaleView } from '@lfd/pim-contracts';
import { FoldPanelRef, FoldToastService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { provideTestSalesContexts } from '../../catalogue/sales-contexts/sales-context-store.testing';
import { PointOfSalePanel } from '../point-of-sale-panel/point-of-sale-panel';
import { PointOfSaleStore } from '../point-of-sale-store';

/**
 * Le refus tel que le backend le renvoie sur un point de vente encore vendu :
 * un 409 dont le corps porte le `message` posé par `AppErrorFilter`. La forme
 * compte — c'est elle que `httpErrorMessage` sait lire, et un faux approximatif
 * testerait le repli au lieu du vrai message.
 */
const IN_USE = {
  status: 409,
  error: {
    code: 'points_of_sale.point_of_sale.in_use',
    message: 'Point de vente encore vendeur : 3 famille(s) le citent.',
  },
};

function shop(over: Partial<PointOfSaleView> = {}): PointOfSaleView {
  return {
    id: 'pos_1',
    kind: 'shop',
    label: 'Village',
    baseUrl: '',
    contexts: ['takeaway'],
    tables: [],
    usedByCategories: 0,
    root: false,
    ...over,
  };
}

/** Le bouton portant ce libellé — on pilote l'écran, pas ses champs privés. */
function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (found === undefined) {
    throw new Error(`Bouton « ${label} » introuvable.`);
  }
  return found;
}

interface Mounted {
  host: HTMLElement;
  store: PointOfSaleStore;
  toasts: FoldToastService;
  closed: unknown[];
  detect: () => void;
  stable: () => Promise<unknown>;
}

function mount(data?: { pointOfSale: PointOfSaleView }): Mounted {
  const closed: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideTestSalesContexts(),
      { provide: FoldPanelRef, useValue: { close: (v: unknown) => closed.push(v) } },
    ],
  });
  const fixture = TestBed.createComponent(PointOfSalePanel);
  if (data !== undefined) {
    fixture.componentRef.setInput('data', data);
  }
  fixture.detectChanges();
  return {
    host: fixture.nativeElement as HTMLElement,
    store: TestBed.inject(PointOfSaleStore),
    toasts: TestBed.inject(FoldToastService),
    closed,
    detect: () => fixture.detectChanges(),
    stable: () => fixture.whenStable(),
  };
}

describe('PointOfSalePanel — la zone dangereuse', () => {
  /**
   * La suppression a quitté le menu de la carte : on supprime ce qu'on est en
   * train de regarder. La zone reste un cadre qui EXPLIQUE et n'arme rien tant
   * que le référentiel refusera — un bouton dont on sait qu'il échouera n'a pas
   * à être offert.
   */
  it("n'arme rien quand des familles y vendent encore", () => {
    const { host } = mount({ pointOfSale: shop({ usedByCategories: 3 }) });

    expect(host.textContent).toContain('Suppression impossible');
    expect(host.textContent).toContain('3 famille(s)');
    expect(host.textContent).not.toContain('Supprimer définitivement');
  });

  it('arme la suppression quand personne ne le vend', () => {
    const { host } = mount({ pointOfSale: shop({ usedByCategories: 0 }) });

    expect(host.textContent).toContain('Supprimer définitivement');
    expect(host.textContent).not.toContain('Suppression impossible');
  });

  /**
   * La racine est un refus d'une AUTRE nature : il ne se lève pas en décochant.
   * L'écran les distingue, sans quoi on chercherait longtemps quelle famille
   * bloque.
   */
  it("dit que la plateforme racine ne se supprime pas, et n'arme rien", () => {
    const { host } = mount({
      pointOfSale: shop({ kind: 'platform', root: true, usedByCategories: 0 }),
    });

    expect(host.textContent).toContain('ne se supprime pas');
    expect(host.textContent).not.toContain('Supprimer définitivement');
  });
});

describe('PointOfSalePanel — un refus du référentiel', () => {
  /**
   * Il affichait `caught.message` — donc « Http failure response for
   * http://… : 409 Conflict » là où le backend avait pris soin de dire quoi
   * faire. Le panneau RESTE ouvert : il y a quelque chose à corriger ici.
   */
  it('rend le message du référentiel, pas celui du transport', async () => {
    const { host, store, toasts, closed, stable } = mount({ pointOfSale: shop() });
    vi.spyOn(store, 'update').mockRejectedValue(IN_USE);

    button(host, 'Enregistrer').click();
    await stable();

    expect(toasts.toasts()[0]?.message).toContain('3 famille(s)');
    expect(toasts.toasts()[0]?.message).not.toContain('Http failure');
    expect(closed).toEqual([]);
  });
});

describe('PointOfSalePanel — le genre', () => {
  it("se choisit à l'ouverture", () => {
    const { host } = mount();

    expect(host.querySelectorAll('fold-listbox')).toHaveLength(1);
  });

  /**
   * Il décide de la forme — adresse, tables — et le basculer laisserait un
   * équipement sans objet. On le MONTRE plutôt que de l'offrir : un
   * interrupteur qui répondrait 409 n'est pas un interrupteur.
   */
  it('se montre sans se proposer au réglage', () => {
    const { host } = mount({ pointOfSale: shop() });

    expect(host.querySelectorAll('fold-listbox')).toHaveLength(0);
    expect(host.textContent).toContain('ne change plus');
  });

  it("n'offre ni adresse ni tables à une plateforme", () => {
    const { host } = mount({ pointOfSale: shop({ kind: 'platform', baseUrl: null }) });

    expect(host.textContent).not.toContain('URL de base');
    expect(host.textContent).not.toContain('Nombre de tables');
  });
});

describe("PointOfSalePanel — l'ouverture", () => {
  it("n'annonce PAS un enregistrement qui n'a pas eu lieu", async () => {
    // `persist` sortait en silence sur un nom vide, et `submit` fermait quand
    // même le panneau avec `close(true)` — soit un succès pour un non-geste.
    const { host, store, closed, stable } = mount();
    const open = vi.spyOn(store, 'openPointOfSale');

    // Le bouton est désarmé ; on force l'appel comme le ferait un raccourci.
    button(host, 'Ouvrir le point de vente').click();
    await stable();

    expect(open).not.toHaveBeenCalled();
    expect(closed).toEqual([]);
  });

  /**
   * L'offre est une LISTE, plus deux cases nommées : le panneau rend ce que le
   * registre porte, et un contexte de plus n'a pas à passer par ici.
   */
  it('propose une case par contexte du registre', () => {
    const { host } = mount();

    const labels = [...host.querySelectorAll('fold-checkbox')].map(
      (box) => box.textContent?.trim() ?? '',
    );
    expect(labels).toEqual(['À emporter', 'Sur place', 'B2B']);
  });
});
