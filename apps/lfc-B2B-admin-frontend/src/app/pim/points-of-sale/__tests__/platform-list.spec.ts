import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SalesContextStore } from '../../catalogue/sales-contexts/sales-context-store';
import { PlatformList } from '../platform-list/platform-list';
import { PointOfSaleStore } from '../point-of-sale-store';

/**
 * Ce que cet écran doit prouver : la plateforme professionnelle est VISIBLE.
 *
 * C'est tout l'objet de la tranche p-0 — le B2B existait déjà, sous la forme
 * d'un `NULL` dans la matrice de canaux, donc aucun écran ne pouvait le
 * montrer.
 */
describe('PlatformList', () => {
  interface Point {
    readonly id: string;
    readonly kind: 'shop' | 'platform';
    readonly label: string;
    readonly baseUrl: string | null;
    readonly contexts: readonly string[];
  }

  function render(points: readonly Point[], contexts: readonly { key: string; label: string }[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        {
          provide: PointOfSaleStore,
          useValue: {
            platforms: () => points.filter((point) => point.kind === 'platform'),
            loadError: () => null,
          },
        },
        { provide: SalesContextStore, useValue: { items: () => contexts, loadError: () => null } },
      ],
    });
    const fixture = TestBed.createComponent(PlatformList);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const b2b: Point = {
    id: 'pos_b2b',
    kind: 'platform',
    label: 'B2B',
    baseUrl: null,
    contexts: ['b2b'],
  };

  it('affiche la plateforme avec le LIBELLÉ de ce qu’elle offre', () => {
    const element = render([b2b], [{ key: 'b2b', label: 'Professionnels' }]);

    expect(element.textContent).toContain('B2B');
    expect(element.textContent).toContain('Professionnels');
  });

  /**
   * Le registre des contextes se charge de son côté. Un trou de course ne doit
   * pas faire disparaître une ligne : la clé s'affiche telle quelle, moche mais
   * vraie.
   */
  it('retombe sur la clé quand le registre ne la connaît pas encore', () => {
    const element = render([b2b], []);

    expect(element.textContent).toContain('b2b');
  });

  /** Les boutiques sont rendues par leur propre liste — leur source d'écriture. */
  it('ignore les boutiques', () => {
    const element = render(
      [b2b, { id: 'shop_1', kind: 'shop', label: 'Village', baseUrl: '', contexts: ['takeaway'] }],
      [],
    );

    expect(element.textContent).not.toContain('Village');
  });
});
