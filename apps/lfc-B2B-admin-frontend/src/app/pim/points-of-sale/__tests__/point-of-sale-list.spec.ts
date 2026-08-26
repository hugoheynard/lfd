import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { PointOfSaleView } from '@lfd/pim-contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { provideTestSalesContexts } from '../../sales-contexts/sales-context-store.testing';
import { PointOfSaleList } from '../point-of-sale-list/point-of-sale-list';
import { PointOfSaleStore } from '../point-of-sale-store';

function point(over: Partial<PointOfSaleView> = {}): PointOfSaleView {
  return {
    id: 'pos_1',
    kind: 'shop',
    label: 'Village',
    baseUrl: 'https://order.example',
    contexts: ['takeaway'],
    tables: [{ number: 1, qrCreated: false, token: null }],
    usedByCategories: 0,
    root: false,
    ...over,
  };
}

function render(points: readonly PointOfSaleView[]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideTestSalesContexts(),
      {
        provide: PointOfSaleStore,
        useValue: { items: () => points, loadError: () => null, reload: () => Promise.resolve() },
      },
    ],
  });
  const fixture = TestBed.createComponent(PointOfSaleList);
  fixture.detectChanges();
  return {
    host: fixture.nativeElement as HTMLElement,
    panels: TestBed.inject(FoldPanelHostService),
  };
}

describe('PointOfSaleList', () => {
  /**
   * La carte ENTIÈRE ouvre le réglage. Il y avait un menu à deux entrées dont
   * l'une ouvrait ce panneau et l'autre le même panneau dans un autre mode.
   */
  it('ouvre le réglage au clic sur la carte', () => {
    const { host, panels } = render([point()]);
    const open = vi.spyOn(panels, 'open');

    host.querySelector('fold-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(open).toHaveBeenCalledTimes(1);
  });

  /**
   * Le piège du clic sur la carte : les commandes de QR sont DEDANS. Sans
   * l'écran de propagation, générer un code ouvrirait aussi le panneau —
   * personne ne le verrait en relisant le gabarit.
   */
  it("n'ouvre RIEN quand on touche une commande de QR", () => {
    const { host, panels } = render([point()]);
    const open = vi.spyOn(panels, 'open');

    const qrButton = [...host.querySelectorAll('button')].find((element) =>
      (element.textContent ?? '').includes('Générer le QR'),
    );
    qrButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(open).not.toHaveBeenCalled();
  });

  /** Les deux genres dans une seule liste — ils étaient dans deux composants. */
  it('rend les boutiques ET les plateformes', () => {
    const { host } = render([
      point(),
      point({ id: 'pos_b2b', kind: 'platform', label: 'B2B', baseUrl: null, root: true }),
    ]);

    expect(host.textContent).toContain('Village');
    expect(host.textContent).toContain('B2B');
    expect(host.textContent).toContain('Plateforme');
  });

  /** Une plateforme n'a ni adresse ni tables : les afficher vides inviterait à les remplir. */
  it("n'affiche pas l'équipement d'une boutique sur une plateforme", () => {
    const { host } = render([
      point({ id: 'pos_b2b', kind: 'platform', label: 'B2B', baseUrl: null, tables: [] }),
    ]);

    expect(host.textContent).not.toContain('URL click & collect');
    expect(host.textContent).not.toContain('Tables');
  });
});
