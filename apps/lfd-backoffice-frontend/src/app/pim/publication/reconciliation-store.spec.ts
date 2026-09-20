import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type {
  ReconciliationBoardView,
  ReconciliationDetailView,
  SnapshotView,
} from '@lfd/pim-contracts';
import { ShopifyApi } from '../channels/shopify-api';
import { ReconciliationStore } from './reconciliation-store';

const BOARD: ReconciliationBoardView = {
  mode: 'live',
  rows: [
    {
      handle: 'croissant',
      productId: 'p1',
      status: 'remote_drift',
      diffCount: 1,
      remoteDrift: true,
    },
  ],
};

const DETAIL: ReconciliationDetailView = {
  handle: 'croissant',
  status: 'remote_drift',
  base: null,
  ours: null,
  theirs: null,
  oursVsBase: [],
  theirsVsBase: [{ field: 'Déclinaisons', before: 'a', after: 'b' }],
};

const HISTORY: SnapshotView[] = [
  { version: 1, hash: 'h', mode: 'live', outcome: 'pushed', pushedAt: 't' },
];

class FakeApi {
  fail = false;
  reconciliation(): Promise<ReconciliationBoardView> {
    return this.fail ? Promise.reject(new Error('down')) : Promise.resolve(BOARD);
  }
  reconciliationDetail(): Promise<ReconciliationDetailView> {
    return Promise.resolve(DETAIL);
  }
  history(): Promise<SnapshotView[]> {
    return Promise.resolve(HISTORY);
  }
}

function make(api: FakeApi): ReconciliationStore {
  TestBed.configureTestingModule({
    providers: [{ provide: ShopifyApi, useValue: api }],
  });
  return TestBed.inject(ReconciliationStore);
}

describe('ReconciliationStore', () => {
  it('charge le board au démarrage', async () => {
    const store = make(new FakeApi());
    await store.reload();
    expect(store.board()?.rows[0]?.status).toBe('remote_drift');
    expect(store.error()).toBeNull();
  });

  it('un backend injoignable pose une erreur, jamais un rejet', async () => {
    const api = new FakeApi();
    api.fail = true;
    const store = make(api);
    await store.reload();
    expect(store.board()).toBeNull();
    expect(store.error()).toContain('injoignable');
  });

  it('charge détail et historique par handle à la demande', async () => {
    const store = make(new FakeApi());
    await store.loadDetail('croissant');
    await store.loadHistory('croissant');
    expect(store.details()['croissant']?.theirsVsBase).toHaveLength(1);
    expect(store.histories()['croissant']?.[0]?.version).toBe(1);
  });
});
