import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type {
  PushSummary,
  ReconciliationBoardView,
  ReconciliationDetailView,
  SnapshotView,
} from '@lfd/pim-contracts';
import { ShopifyApi } from '../../channels/shopify-api';
import { PublicationShopify } from './publication-shopify';

function board(): ReconciliationBoardView {
  return {
    mode: 'live',
    rows: [
      {
        handle: 'croissant',
        productId: 'p1',
        status: 'remote_drift',
        diffCount: 1,
        remoteDrift: true,
      },
      {
        handle: 'baguette',
        productId: 'p3',
        status: 'never_published',
        diffCount: 0,
        remoteDrift: false,
      },
      {
        handle: 'ghost',
        productId: null,
        status: 'to_remove',
        diffCount: 0,
        remoteDrift: false,
      },
    ],
  };
}

/** Fake transport — enregistre les push, pas de HTTP. */
class FakeApi {
  readonly pushes: { ids: string[] | undefined; dryRun: boolean }[] = [];

  reconciliation(): Promise<ReconciliationBoardView> {
    return Promise.resolve(board());
  }
  reconciliationDetail(handle: string): Promise<ReconciliationDetailView> {
    return Promise.resolve({
      handle,
      status: 'remote_drift',
      base: null,
      ours: null,
      theirs: null,
      oursVsBase: [],
      theirsVsBase: [{ field: 'Déclinaisons', before: 'a', after: 'b' }],
    });
  }
  history(): Promise<SnapshotView[]> {
    return Promise.resolve([]);
  }
  push(ids?: string[], dryRun = false): Promise<PushSummary> {
    this.pushes.push({ ids, dryRun });
    return Promise.resolve({ mode: 'live', results: [], taxCollections: null });
  }
}

async function render(api: FakeApi): Promise<ComponentFixture<PublicationShopify>> {
  TestBed.configureTestingModule({
    providers: [{ provide: ShopifyApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(PublicationShopify);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<PublicationShopify>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('PublicationShopify', () => {
  it('rend les statuts à trois voies et le bandeau mode réel', async () => {
    const fixture = await render(new FakeApi());
    const content = text(fixture);
    expect(content).toContain('Modifié en boutique');
    expect(content).toContain('Jamais publié');
    expect(content).toContain('À retirer');
    expect(content).toContain('Mode réel');
  });

  it('« Tout actionnable » ne vise que les lignes actionnables avec produit', async () => {
    const api = new FakeApi();
    const fixture = await render(api);
    const component = fixture.componentInstance;

    component['toggleAll'](true);
    await component['publish']();

    // baguette (never_published) est actionnable ; croissant (remote_drift) et
    // ghost (to_remove sans produit) ne le sont pas.
    expect(api.pushes.at(-1)?.ids).toEqual(['p3']);
    expect(api.pushes.at(-1)?.dryRun).toBe(false);
  });

  it('le pré-push part en dry-run', async () => {
    const api = new FakeApi();
    const fixture = await render(api);
    const component = fixture.componentInstance;

    component['toggle']('p1', true);
    await component['prePush']();

    expect(api.pushes.at(-1)?.ids).toEqual(['p1']);
    expect(api.pushes.at(-1)?.dryRun).toBe(true);
  });
});
