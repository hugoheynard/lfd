import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { CacheMetricsReport, SharedCacheFigures } from '@lfd/ops-contract';

import { OpsService } from '../ops.service';
import { CacheBoard } from './cache-board';

const figures = (over: Partial<SharedCacheFigures>): SharedCacheFigures => ({
  hits: 0,
  misses: 0,
  hitRate: null,
  stores: 0,
  tooLarge: 0,
  bytes: null,
  entries: null,
  persons: 0,
  ...over,
});

const REPORT: CacheMetricsReport = {
  generatedAt: '2026-01-02T10:12:00.000Z',
  days: 30,
  lastHourStartedAt: '2026-01-02T10:00:00.000Z',
  caches: [
    {
      cache: 'pro-shelves',
      object: 'pro-shelves',
      lastHour: figures({ hits: 30, misses: 10, hitRate: 0.75, bytes: 2048, persons: 4 }),
      last24h: figures({ hits: 300, misses: 100, hitRate: 0.75, bytes: 2048, persons: 9 }),
      points: [
        { hour: '2026-01-02T08:00:00.000Z', ...figures({ hitRate: 0.5, bytes: 1024 }) },
        { hour: '2026-01-02T09:00:00.000Z', ...figures({ hitRate: 0.75, bytes: 2048 }) },
      ],
    },
    {
      cache: 'day-versions',
      object: 'day-versions',
      lastHour: figures({ hits: 10, misses: 0, hitRate: 1, bytes: 1024, persons: 6 }),
      last24h: figures({ hits: 100, misses: 0, hitRate: 1, bytes: 1024, persons: 7 }),
      points: [],
    },
  ],
  objects: [
    {
      object: 'pro-shelves',
      state: 'read',
      lastHourPeakPerSecond: 12,
      last24hPeakPerSecond: 40,
      peaks: [],
    },
    {
      object: 'day-versions',
      state: 'unreachable',
      lastHourPeakPerSecond: null,
      last24hPeakPerSecond: null,
      peaks: [],
    },
  ],
  instance: {
    windowMinutes: 30,
    calls: [
      {
        store: 'pro-shelves',
        operation: 'get',
        calls: 5,
        late: 0,
        p50Ms: 8,
        p95Ms: 21,
        lateFinishP95Ms: null,
        windowMinutes: 30,
      },
    ],
    fallbacks: [{ store: 'pro-shelves', count: 3 }],
    outcomes: [],
  },
};

class FakeOps {
  fail = false;
  report: CacheMetricsReport = REPORT;
  asked: number[] = [];

  caches(days: number): Promise<CacheMetricsReport> {
    this.asked.push(days);
    return this.fail ? Promise.reject(new Error('down')) : Promise.resolve(this.report);
  }
}

async function render(ops: FakeOps): Promise<ComponentFixture<CacheBoard>> {
  TestBed.configureTestingModule({
    imports: [CacheBoard],
    providers: [{ provide: OpsService, useValue: ops }],
  });
  const fixture = TestBed.createComponent(CacheBoard);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (f: ComponentFixture<CacheBoard>): string =>
  (f.nativeElement as HTMLElement).textContent ?? '';

describe('CacheBoard', () => {
  it('lit trente jours à l’ouverture', async () => {
    const ops = new FakeOps();
    await render(ops);
    expect(ops.asked).toEqual([30]);
  });

  it('additionne les caches en tête, sans additionner les personnes', async () => {
    const f = await render(new FakeOps());
    const gauges = (f.nativeElement as HTMLElement).querySelectorAll('.gauge-value');
    const values = Array.from(gauges, (g) => (g.textContent ?? '').trim());
    // 40 réussites sur 50 lectures dans l'heure.
    expect(values[0]).toBe('80%');
    expect(values[1]).toBe('40');
    expect(values[2]).toBe('3 ko');
    // Le plus fort des deux caches, pas leur somme.
    expect(values[3]).toBe('6');
    expect(values[4]).toContain('12');
    expect(values[5]).toContain('21');
    expect(values[6]).toBe('3');
  });

  it('dit un objet injoignable par un encart, et garde le reste', async () => {
    const f = await render(new FakeOps());
    const callout = (f.nativeElement as HTMLElement).querySelector('fold-callout');
    expect(callout?.textContent).toContain('day-versions');
    expect(callout?.textContent).toContain('injoignable');
    expect(text(f)).toContain('Par cache');
  });

  it('trace les deux courbes du premier cache', async () => {
    const f = await render(new FakeOps());
    expect((f.nativeElement as HTMLElement).querySelectorAll('svg path.line').length).toBe(2);
  });

  it('dit l’échec de lecture et propose de relire', async () => {
    const ops = new FakeOps();
    ops.fail = true;
    const f = await render(ops);
    expect(text(f)).toContain('Compteurs illisibles');
    ops.fail = false;
    ((f.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement).click();
    await f.whenStable();
    f.detectChanges();
    expect(text(f)).toContain('Taux de réussite');
  });

  it('dit l’absence de compteurs', async () => {
    const ops = new FakeOps();
    ops.report = { ...REPORT, caches: [], objects: [] };
    const f = await render(ops);
    expect(text(f)).toContain('Aucun cache compté');
  });
});
