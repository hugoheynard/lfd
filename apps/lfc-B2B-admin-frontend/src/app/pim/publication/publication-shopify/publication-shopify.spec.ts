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
  readonly pushes: {
    ids: string[] | undefined;
    dryRun: boolean;
    hashes?: Readonly<Record<string, string>>;
  }[] = [];
  /** Ce que le prochain push rendra — pour jouer un refus de dérive. */
  next: PushSummary | null = null;

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
  push(
    ids?: string[],
    dryRun = false,
    hashes?: Readonly<Record<string, string>>,
  ): Promise<PushSummary> {
    this.pushes.push(hashes === undefined ? { ids, dryRun } : { ids, dryRun, hashes });
    return Promise.resolve(this.next ?? { mode: 'live', results: [], taxCollections: null });
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

/**
 * Ce que ces cas tiennent : **le jeton fait l'aller-retour**, et un refus ne
 * s'oublie pas au clic suivant.
 */
describe('PublicationShopify — les empreintes du pré-push', () => {
  const summary = (outcome: PushSummary['results'][number]['outcome']): PushSummary => ({
    mode: 'live',
    taxCollections: null,
    results: [{ productId: 'p1', sku: 'VIE-001', outcome, message: '', hash: 'hache-A' }],
  });

  it('redonne à la publication les empreintes lues au pré-push', async () => {
    const api = new FakeApi();
    api.next = summary('pushed');
    const fixture = await render(api);
    const component = fixture.componentInstance;

    component['toggle']('p1', true);
    await component['prePush']();
    await component['publish']();

    expect(api.pushes.at(-1)?.hashes).toEqual({ p1: 'hache-A' });
  });

  /**
   * 🔴 Un refus doit survivre au clic. Vider les empreintes ici laisserait le
   * geste suivant passer SANS relecture — précisément le trou qu'elles ferment.
   * Le seul geste qui les renouvelle est un nouveau pré-push.
   */
  it('garde les empreintes après un refus, pour que le refus persiste', async () => {
    const api = new FakeApi();
    api.next = summary('pushed');
    const fixture = await render(api);
    const component = fixture.componentInstance;

    component['toggle']('p1', true);
    await component['prePush']();

    api.next = summary('drifted');
    await component['publish']();
    await component['publish']();

    expect(api.pushes.at(-1)?.hashes).toEqual({ p1: 'hache-A' });
  });

  /** Un refus n'est pas une panne : le message ne doit pas envoyer chercher un bug. */
  it('nomme le refus à part d’un échec, et dit le geste de sortie', async () => {
    const api = new FakeApi();
    api.next = summary('drifted');
    const fixture = await render(api);
    const component = fixture.componentInstance;

    component['toggle']('p1', true);
    await component['publish']();

    expect(component['message']()).toContain('modifiée(s) depuis votre relecture');
    expect(component['message']()).not.toContain('échec');
  });
});
