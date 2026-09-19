import { HttpErrorResponse } from '@angular/common/http';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type {
  ProductHistoryEntryView,
  ProductHistoryInheritedKind,
  ProductHistoryPageView,
  ProductHistoryPlacementView,
} from '@lfd/pim-contracts';
import { FoldPaginatorComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../../auth/permissions.store';
import { ProductHistoryHttpApi, type ProductHistoryRequest } from '../../product-history-http-api';
import { circleMark, ProductHistory } from './product-history';

/**
 * **L'onglet « Historique » d'une fiche produit.**
 *
 * Ce que ces cas protègent : la même vue figée que le journal (page 1 sans
 * ancre, les suivantes avec celle qu'elle a rendue, une ancre refusée rouvre la
 * page 1), le repère de chaque cercle, et un lien vers le journal qui ne
 * s'offre qu'à qui peut le lire.
 */

const PRODUCT = 'prd_42';
const ANCHOR = '01JANCHOR';

type EntryFields = Omit<ProductHistoryEntryView, keyof ProductHistoryPlacementView>;

function entry(
  id: string,
  fields: Partial<EntryFields> = {},
  placement: ProductHistoryPlacementView = { circle: 'product' },
): ProductHistoryEntryView {
  return {
    ...placement,
    id,
    type: 'product.published',
    occurredAt: '2026-08-21T10:00:00.000Z',
    actorName: 'Hugo Heynard',
    actorType: 'staff',
    payload: { name: 'Croissant', sku: 'P-000042' },
    subjectType: 'product',
    subjectId: PRODUCT,
    ...fields,
  };
}

function inheritedFrom(
  kind: ProductHistoryInheritedKind,
  label: string,
): ProductHistoryPlacementView {
  return { circle: 'inherited', inheritedFrom: { kind, id: 'x', label } };
}

interface Server {
  total?: number;
  entries?: readonly ProductHistoryEntryView[];
  /** Refuse la lecture par ce statut HTTP ; `null` = la sert. */
  fail?: (request: ProductHistoryRequest) => number | null;
}

interface Mounted {
  readonly fixture: ComponentFixture<ProductHistory>;
  readonly requests: ProductHistoryRequest[];
}

async function mount(server: Server = {}, permissions: readonly string[] = []): Promise<Mounted> {
  const requests: ProductHistoryRequest[] = [];
  const total = server.total ?? 45;
  const api: Pick<ProductHistoryHttpApi, 'page'> = {
    page: (_id, request) => {
      requests.push(request);
      const status = server.fail?.(request) ?? null;
      if (status !== null) {
        return Promise.reject(new HttpErrorResponse({ status }));
      }
      const view: ProductHistoryPageView = {
        entries: server.entries ?? (total === 0 ? [] : [entry(`evt_p${request.page}`)]),
        total,
        page: request.page,
        pageSize: request.pageSize,
        asOf: total === 0 ? null : (request.asOf ?? ANCHOR),
      };
      return Promise.resolve(view);
    },
  };
  const store: Pick<PermissionsStore, 'can'> = {
    can: (permission) => permissions.includes(permission),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ProductHistoryHttpApi, useValue: api },
      { provide: PermissionsStore, useValue: store },
    ],
  });
  const fixture = TestBed.createComponent(ProductHistory);
  fixture.componentRef.setInput('productId', PRODUCT);
  await settled(fixture);
  return { fixture, requests };
}

async function settled(fixture: ComponentFixture<unknown>): Promise<string> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return String(fixture.nativeElement.textContent ?? '');
}

function paginator(fixture: ComponentFixture<unknown>): FoldPaginatorComponent | null {
  const debug = fixture.debugElement.query(By.directive(FoldPaginatorComponent));
  return debug === null ? null : debug.injector.get(FoldPaginatorComponent);
}

async function goTo(fixture: ComponentFixture<unknown>, page: number): Promise<string> {
  paginator(fixture)?.pageChange.emit(page);
  return settled(fixture);
}

describe('l’historique d’une fiche, par pages', () => {
  it('lit la page 1 sans ancre, vingt faits', async () => {
    const { requests } = await mount();

    expect(requests).toEqual([{ page: 1, pageSize: 20 }]);
  });

  it("renvoie l'ancre de la page 1 pour lire la page 2, et dit que la vue est figée", async () => {
    const { fixture, requests } = await mount();
    expect(await settled(fixture)).not.toContain('Vue figée');

    const text = await goTo(fixture, 2);

    expect(requests[1]).toEqual({ page: 2, pageSize: 20, asOf: ANCHOR });
    expect(text).toContain('Vue figée à');
  });

  it('revenir en page 1 rouvre une vue neuve, sans ancre', async () => {
    const { fixture, requests } = await mount();
    await goTo(fixture, 2);

    const text = await goTo(fixture, 1);

    expect(requests[2]).toEqual({ page: 1, pageSize: 20 });
    expect(text).not.toContain('Vue figée');
  });

  /**
   * La fiche a changé de famille entre deux pages : le serveur ne reconnaît
   * plus l'ancre. Rester sur la page d'avant avec un message ferait croire que
   * la page 2 existe encore.
   */
  it('rouvre la page 1 quand le serveur refuse l’ancre (400)', async () => {
    const { fixture, requests } = await mount({
      fail: (request) => (request.asOf === undefined ? null : 400),
    });

    const text = await goTo(fixture, 2);

    expect(requests.slice(1)).toEqual([
      { page: 2, pageSize: 20, asOf: ANCHOR },
      { page: 1, pageSize: 20 },
    ]);
    expect(text).not.toContain('Vue figée');
    expect(text).not.toContain('n’a pas pu être lue');
  });

  it('garde la page affichée quand une page suivante échoue pour une autre raison', async () => {
    const { fixture } = await mount({
      fail: (request) => (request.asOf === undefined ? null : 500),
    });

    const text = await goTo(fixture, 2);

    expect(text).toContain('Cette page n’a pas pu être lue');
    expect(text).toContain('Produit « Croissant » publié au catalogue (P-000042)');
  });

  it('ne pose pas de paginateur quand tout tient sur une page', async () => {
    const { fixture } = await mount({ total: 3 });

    expect(paginator(fixture)).toBeNull();
  });
});

describe('les lignes de l’historique', () => {
  it('raconte le fait avec la phrase du journal, son auteur et sa date', async () => {
    const { fixture } = await mount();
    const text = await settled(fixture);

    expect(text).toContain('Produit « Croissant » publié au catalogue (P-000042)');
    expect(text).toContain('par Hugo Heynard');
    expect(text).toContain('2026');
  });

  it('dit « le système » pour un acte du système sans nom', async () => {
    const { fixture } = await mount({
      entries: [entry('e1', { actorName: null, actorType: 'system' })],
    });

    expect(await settled(fixture)).toContain('par le système');
  });

  /**
   * Un nom absent n'est pas toujours le système : un membre que l'annuaire n'a
   * pas su nommer ce jour-là se lit comme tel, pas comme une machine.
   */
  it('dit « un membre de l’équipe » pour un auteur staff sans nom', async () => {
    const { fixture } = await mount({
      entries: [entry('e1', { actorName: null, actorType: 'staff' })],
    });

    const text = await settled(fixture);
    expect(text).toContain('par un membre de l’équipe');
    expect(text).not.toContain('par le système');
  });

  it('marque ce qui est hérité, et la révision, mais pas la fiche elle-même', async () => {
    const { fixture } = await mount({
      entries: [
        entry('e1'),
        entry(
          'e2',
          { type: 'vat_rate.rate_changed', payload: { name: 'Réduit', from: 5.5, to: 10 } },
          inheritedFrom('vat_rate', 'Réduit'),
        ),
        entry('e3', { type: 'catalog_revision.taken' }, { circle: 'revision' }),
      ],
    });
    const text = await settled(fixture);

    expect(text).toContain('Taux de « Réduit » passé de 5,5 % à 10 %');
    expect(text).toContain('Hérité du taux Réduit');
    expect(text).toContain('Révision');
    const badges = fixture.debugElement.queryAll(By.css('fold-badge'));
    expect(badges).toHaveLength(2);
  });
});

describe('circleMark', () => {
  const inherited = (kind: ProductHistoryInheritedKind) =>
    circleMark(entry('e', {}, inheritedFrom(kind, 'Beurre AOP')))?.label;

  it('nomme chaque sorte d’héritage', () => {
    expect(inherited('category')).toBe('Hérité de la famille Beurre AOP');
    expect(inherited('vat_rate')).toBe('Hérité du taux Beurre AOP');
    expect(inherited('ingredient')).toBe('Hérité de l’ingrédient Beurre AOP');
    expect(inherited('appellation')).toBe('Hérité de l’appellation Beurre AOP');
  });

  it('ne marque pas un fait de la fiche, et marque une révision', () => {
    expect(circleMark(entry('e'))).toBeNull();
    expect(circleMark(entry('e', {}, { circle: 'revision' }))?.label).toBe('Révision');
  });
});

describe('le renvoi au journal', () => {
  it('n’apparaît pas sans activity:read — le journal rendrait 403', async () => {
    const { fixture } = await mount();

    expect(await settled(fixture)).not.toContain('Voir aussi dans le journal');
  });

  it('mène au journal filtré sur la fiche pour qui peut le lire', async () => {
    const { fixture } = await mount({}, ['activity:read']);
    await settled(fixture);

    const link = fixture.debugElement.query(By.css('a[foldButton]'));
    expect(link.nativeElement.textContent).toContain('Voir aussi dans le journal');
    expect(link.nativeElement.getAttribute('href')).toBe(
      `/admin/journal?subjectType=product&subjectId=${PRODUCT}`,
    );
  });

  it('rappelle que l’héritage suit ce que la fiche porte aujourd’hui', async () => {
    const { fixture } = await mount();

    expect(await settled(fixture)).toContain('ce que la fiche porte aujourd’hui');
  });
});

describe('les états de l’onglet', () => {
  it('dit qu’aucun fait n’est enregistré quand rien n’a touché la fiche', async () => {
    const { fixture } = await mount({ total: 0 });

    expect(await settled(fixture)).toContain('Aucun fait enregistré pour cette fiche');
  });

  it('propose de réessayer quand la lecture échoue, et relit la page 1', async () => {
    let failing = true;
    const { fixture, requests } = await mount({ fail: () => (failing ? 500 : null) });
    expect(await settled(fixture)).toContain('L’historique n’a pas pu être lu.');

    failing = false;
    const retry = fixture.debugElement
      .queryAll(By.css('button'))
      .find((button) => String(button.nativeElement.textContent).includes('Réessayer'));
    retry?.nativeElement.click();
    const text = await settled(fixture);

    expect(requests.at(-1)).toEqual({ page: 1, pageSize: 20 });
    expect(text).toContain('Produit « Croissant »');
  });
});
