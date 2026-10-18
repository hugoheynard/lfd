import type { CatalogReemissionView } from '@lfd/pim-contracts';

/** Un travail de réémission, à compléter par le cas. */
export function aJob(overrides: Partial<CatalogReemissionView> = {}): CatalogReemissionView {
  return {
    id: 'job_1',
    scope: 'all',
    productId: null,
    status: 'running',
    startedAt: '2026-10-18T09:00:00.000Z',
    finishedAt: null,
    productsAttempted: 0,
    productsSucceeded: 0,
    failures: [],
    error: null,
    startedBy: 'staff_1',
    startedByName: 'Hugo Heynard',
    ...overrides,
  };
}
