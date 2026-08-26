import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { PointOfSaleView } from '@lfd/pim-contracts';
import { FoldPanelRef, FoldToastService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { provideTestSalesContexts } from '../../catalogue/sales-contexts/sales-context-store.testing';
import { ShopFormPanel } from '../shop-form-panel/shop-form-panel';
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

function mount(data?: { mode: 'edit' | 'delete'; shop: PointOfSaleView }): Mounted {
  const closed: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideTestSalesContexts(),
      { provide: FoldPanelRef, useValue: { close: (v: unknown) => closed.push(v) } },
    ],
  });
  const fixture = TestBed.createComponent(ShopFormPanel);
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

describe('ShopFormPanel — supprimer une boutique encore vendue', () => {
  /**
   * Le référentiel refuse tant qu'une famille y vend. Le panneau offrait
   * pourtant un bouton armé et laissait le refus arriver après le clic.
   */
  it("dit le refus AVANT le clic, et n'offre rien à retaper", () => {
    const { host } = mount({ mode: 'delete', shop: shop({ usedByCategories: 3 }) });

    expect(host.textContent).toContain('Suppression impossible');
    expect(host.textContent).toContain('3 famille(s)');
    expect(host.querySelectorAll('fold-input')).toHaveLength(0);
    expect(button(host, 'Supprimer définitivement').disabled).toBe(true);
  });

  it('propose la confirmation quand personne ne le vend', () => {
    const { host } = mount({ mode: 'delete', shop: shop({ usedByCategories: 0 }) });

    expect(host.textContent).toContain('Zone dangereuse');
    expect(host.textContent).not.toContain('Suppression impossible');
  });

  /**
   * Il affichait `caught.message` — donc « Http failure response for
   * http://… : 409 Conflict » là où le backend avait pris soin de dire quoi
   * faire.
   */
  it('rend le message du référentiel, pas celui du transport', async () => {
    const { host, store, toasts, closed, detect, stable } = mount({
      mode: 'delete',
      shop: shop({ usedByCategories: 0 }),
    });
    vi.spyOn(store, 'remove').mockRejectedValue(IN_USE);
    const input = host.querySelector('fold-input input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('champ de confirmation introuvable');
    }
    input.value = 'Village';
    input.dispatchEvent(new Event('input'));
    detect();

    button(host, 'Supprimer définitivement').click();
    await stable();

    expect(toasts.toasts()[0]?.message).toContain('3 famille(s) le citent');
    expect(toasts.toasts()[0]?.message).not.toContain('Http failure');
    // Le panneau reste ouvert : il y a quelque chose à corriger ailleurs.
    expect(closed).toEqual([]);
  });
});

describe('ShopFormPanel — la création', () => {
  it("n'annonce PAS un enregistrement qui n'a pas eu lieu", async () => {
    // `persist` sortait en silence sur un nom vide, et `submit` fermait quand
    // même le panneau avec `close(true)` — soit un succès pour un non-geste.
    const { host, store, closed, stable } = mount();
    const open = vi.spyOn(store, 'openShop');

    // Le bouton est désarmé ; on force l'appel comme le ferait un raccourci.
    button(host, 'Ajouter la boutique').click();
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
