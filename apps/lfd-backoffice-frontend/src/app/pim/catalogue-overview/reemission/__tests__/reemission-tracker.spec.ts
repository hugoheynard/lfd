import { TestBed } from '@angular/core/testing';
import type { CatalogReemissionView } from '@lfd/pim-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReemissionHttpApi } from '../reemission-http-api';
import { REEMISSION_POLL_MS, ReemissionTracker } from '../reemission-tracker';
import { aJob } from './reemission-fixtures';

/** L'API doublée : chaque relecture rend l'état suivant de la file, puis le dernier. */
function apiReading(
  states: readonly CatalogReemissionView[],
  latest: CatalogReemissionView | null,
) {
  const reads: string[] = [];
  const starts: (string | null)[] = [];
  let index = 0;
  const api: Pick<ReemissionHttpApi, 'start' | 'byId' | 'latest'> = {
    start: (productId) => {
      starts.push(productId);
      return Promise.resolve('job_1');
    },
    byId: (id) => {
      reads.push(id);
      const state = states[Math.min(index, states.length - 1)] ?? aJob();
      index += 1;
      return Promise.resolve(state);
    },
    latest: () => Promise.resolve(latest),
  };
  return { api, reads, starts };
}

function tracker(api: Pick<ReemissionHttpApi, 'start' | 'byId' | 'latest'>): ReemissionTracker {
  TestBed.configureTestingModule({
    providers: [ReemissionTracker, { provide: ReemissionHttpApi, useValue: api }],
  });
  return TestBed.inject(ReemissionTracker);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReemissionTracker', () => {
  it("relit le travail lancé jusqu'à son issue, puis s'arrête", async () => {
    const done = aJob({ status: 'done', productsAttempted: 3, productsSucceeded: 3 });
    const { api, reads, starts } = apiReading([aJob(), aJob({ productsAttempted: 1 }), done], null);
    const subject = tracker(api);

    await subject.launch(null);
    expect(starts).toEqual([null]);
    expect(subject.running()).toBe(true);

    await vi.advanceTimersByTimeAsync(REEMISSION_POLL_MS);
    expect(subject.job()?.productsAttempted).toBe(1);
    await vi.advanceTimersByTimeAsync(REEMISSION_POLL_MS);
    expect(subject.job()).toEqual(done);

    await vi.advanceTimersByTimeAsync(REEMISSION_POLL_MS * 3);
    expect(reads).toHaveLength(3);
  });

  it('suit la dernière réémission si elle tourne encore', async () => {
    const { api, reads } = apiReading([aJob({ status: 'failed', error: 'arrêt' })], aJob());
    const subject = tracker(api);

    await subject.showLatest();
    await vi.advanceTimersByTimeAsync(REEMISSION_POLL_MS);

    expect(reads).toEqual(['job_1']);
    expect(subject.job()?.status).toBe('failed');
  });

  it('dit le refus du lancement, sans travail affiché', async () => {
    const { api } = apiReading([], null);
    const refusing: Pick<ReemissionHttpApi, 'start' | 'byId' | 'latest'> = {
      ...api,
      start: () =>
        Promise.reject({ status: 409, error: { message: 'Une réémission est déjà en cours.' } }),
    };
    const subject = tracker(refusing);

    await subject.launch(null);

    expect(subject.error()).toBe('Une réémission est déjà en cours.');
    expect(subject.job()).toBeNull();
    expect(subject.starting()).toBe(false);
  });
});
