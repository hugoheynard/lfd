import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CatalogHealthView, CatalogParityView, PendingDeliveryView } from '@lfd/contracts';
import type { CatalogOverviewView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { B2bIntegration } from '../b2b-integration';

/**
 * Ce que ces cas tiennent : **une seule des trois lignes réveille**, et
 * l'aperçu avant push ne s'affiche pas tout seul.
 *
 * Le second point n'est pas cosmétique. Le référent de l'aperçu est « ce que le
 * référentiel publierait maintenant », donc son écart est légitime en
 * permanence — le fil fait exprès que le miroir retarde. L'afficher d'office
 * rejouerait exactement ce que le découpage en trois lignes vient de démonter.
 */

const OVERVIEW: CatalogOverviewView = {
  products: 3,
  published: 3,
  drafts: 0,
  signed: 3,
  articles: 3,
  lastRevision: {
    id: 'rev_1',
    reference: 'R-AAAAAA',
    label: null,
    hash: 'empreinte-A',
    takenAt: '2026-01-01T09:00:00.000Z',
    takenBy: 'staff_1',
    articles: 3,
  },
  sinceLastRevision: { added: 0, removed: 0, changed: 0 },
};

const SANS_DERIVE: CatalogParityView = {
  referenceCount: 3,
  mirrorCount: 3,
  missing: [],
  stale: [],
  priceGaps: [],
  vatGaps: [],
  nameGaps: [],
  inSync: true,
};

function health(over: Partial<CatalogHealthView> = {}): CatalogHealthView {
  return {
    version: {
      id: 'cver_1',
      revisionId: 'rev_1',
      createdAt: '2026-01-02T09:00:00.000Z',
      itemCount: 3,
    },
    drift: SANS_DERIVE,
    ...over,
  };
}

async function render(options: {
  readonly overview?: CatalogOverviewView;
  readonly pending?: PendingDeliveryView | null;
  readonly health?: CatalogHealthView;
}) {
  TestBed.configureTestingModule({
    imports: [B2bIntegration],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture: ComponentFixture<B2bIntegration> = TestBed.createComponent(B2bIntegration);
  fixture.detectChanges();

  const http = TestBed.inject(HttpTestingController);
  http
    .expectOne((request) => request.url.endsWith('/catalogue/revisions/overview'))
    .flush(options.overview ?? OVERVIEW);
  http
    .expectOne((request) => request.url.endsWith('/admin/catalog/delivery'))
    .flush(options.pending ?? null);
  http
    .expectOne((request) => request.url.endsWith('/admin/catalog/health'))
    .flush(options.health ?? health());

  // Les trois lectures sont un `Promise.all` de `firstValueFrom` : le
  // planificateur zoneless ne les suit pas, donc `whenStable` seul rendrait la
  // main avant leur résolution. On laisse la file de microtâches se vider.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, http };
}

const text = (fixture: ComponentFixture<B2bIntegration>): string =>
  fixture.nativeElement.textContent ?? '';

describe('B2bIntegration — les trois lignes', () => {
  it('lit les trois états à l’ouverture, et ne compare rien de plus', async () => {
    const { fixture, http } = await render({});

    expect(text(fixture)).toContain('Rien de neuf au référentiel');
    expect(text(fixture)).toContain('Aucune arrivée en attente');
    expect(text(fixture)).toContain('porte exactement ce qui a été validé');
    // 🔴 L'aperçu N'EST PAS demandé : son écart serait légitime en permanence.
    http.expectNone((request) => request.url.endsWith('/admin/catalog/parity'));
  });

  /**
   * Les deux premières lignes décrivent un fonctionnement NORMAL. Les rendre
   * alarmantes ferait sonner l'écran tous les jours — donc jamais.
   */
  it('ne crie ni sur du travail en cours ni sur une arrivée à relire', async () => {
    const { fixture } = await render({
      overview: { ...OVERVIEW, sinceLastRevision: { added: 1, removed: 0, changed: 2 } },
      pending: {
        id: 'd_1',
        revisionId: 'rev_2',
        receivedAt: '2026-01-03T09:00:00.000Z',
        carriesAllergenChange: false,
        changes: [{ sku: 'VIE-001-1', kind: 'changed', fields: ['price'], name: 'Croissant' }],
      },
    });

    expect(text(fixture)).toContain('3 changements au référentiel');
    expect(text(fixture)).toContain("attend d'être relu");
    expect(text(fixture)).not.toContain('a décroché');
  });

  /** 🔴 La seule qui doive réveiller quelqu'un. */
  it('alerte quand la boutique a décroché de la version validée', async () => {
    const { fixture } = await render({
      health: health({
        drift: { ...SANS_DERIVE, inSync: false, missing: ['VIE-001-1'] },
      }),
    });

    expect(text(fixture)).toContain('a décroché de la version validée');
    expect(text(fixture)).toContain('Aucun geste normal ne produit cet écart');
  });

  /**
   * Rien n'a jamais été validé : il n'y a rien à quoi comparer. Annoncer un
   * catalogue sain serait affirmer un contrôle qui n'a pas eu lieu.
   */
  it('dit qu’il n’y a rien à comparer tant qu’aucune version n’existe', async () => {
    const { fixture } = await render({ health: { version: null, drift: null } });

    expect(text(fixture)).toContain('Aucune version validée');
    expect(text(fixture)).not.toContain('a décroché');
  });
});
