import { DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  type FoldSelectOption,
  type FoldTableEmpty,
} from 'fold-ng';

import type {
  CacheFallbackCount,
  CacheMetricsReport,
  SharedCacheFigures,
  SharedCacheSeries,
  SharedObjectReport,
} from '@lfd/ops-contract';

import { bytesLabel, chartLineOf, type ChartLine } from '../cache-chart';
import { OpsService } from '../ops.service';
import { CACHE_COLUMNS, FALLBACK_COLUMNS } from './cache-board-columns';

type LoadState = 'loading' | 'error' | 'ready';

/** La période lue : celle que l'objet garde. */
const DAYS = 30;

/** La boîte des courbes, en unités SVG ; le dessin s'étire à la largeur de la carte. */
export const CHART_BOX = { width: 600, height: 120 } as const;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Ce qu'on dit d'un objet qui n'a pas répondu — l'état vient du serveur. */
const OBJECT_NOTICE: Readonly<Record<'unreachable' | 'not-configured', string>> = {
  unreachable: 'injoignable : ses compteurs manquent à cette lecture.',
  'not-configured': 'pas configuré sur cette instance : il ne compte rien.',
};

/**
 * Le total de plusieurs caches. Les personnes ne s'additionnent pas : on garde
 * le plus fort. La taille en clair ne somme que les caches qui la connaissent
 * (les contenus) : la tête le dit.
 */
function combine(figures: readonly SharedCacheFigures[]): {
  readonly hits: number;
  readonly hitRate: number | null;
  readonly persons: number;
  readonly bytes: number | null;
  readonly rawBytes: number | null;
} {
  const hits = figures.reduce((sum, f) => sum + f.hits, 0);
  const reads = hits + figures.reduce((sum, f) => sum + f.misses, 0);
  const sizes = figures.map((f) => f.bytes).filter((b): b is number => b !== null);
  const raw = figures.map((f) => f.rawBytes).filter((b): b is number => b !== null);
  return {
    hits,
    hitRate: reads === 0 ? null : hits / reads,
    persons: Math.max(0, ...figures.map((f) => f.persons)),
    bytes: sizes.length === 0 ? null : sizes.reduce((sum, b) => sum + b, 0),
    rawBytes: raw.length === 0 ? null : raw.reduce((sum, b) => sum + b, 0),
  };
}

/**
 * **Onglet Cache de Santé** — les compteurs que les objets partagés tiennent
 * eux-mêmes, donc pour toute la flotte : la tête (heure en cours et 24 h), deux
 * courbes sur la période et un tableau par cache. Relu à chaque ouverture de
 * l'onglet, sans store : ce sont des chiffres d'instant.
 */
@Component({
  selector: 'app-cache-board',
  imports: [
    DecimalPipe,
    PercentPipe,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './cache-board.html',
  styleUrl: './cache-board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CacheBoard {
  private readonly ops = inject(OpsService);

  protected readonly box = CHART_BOX;
  protected readonly bytesLabel = bytesLabel;
  protected readonly state = signal<LoadState>('loading');
  protected readonly report = signal<CacheMetricsReport | null>(null);
  protected readonly caches = computed(() => this.report()?.caches ?? []);

  /** Les objets qui n'ont pas répondu : dits en tête, le reste de l'écran reste lisible. */
  protected readonly silentObjects = computed(() =>
    (this.report()?.objects ?? []).flatMap((object: SharedObjectReport) =>
      object.state === 'read'
        ? []
        : [
            {
              object: object.object,
              tone: object.state === 'unreachable' ? 'alert' : 'warning',
              text: OBJECT_NOTICE[object.state],
            } as const,
          ],
    ),
  );

  protected readonly head = computed(() => {
    const report = this.report();
    const caches = this.caches();
    const objects = report?.objects ?? [];
    const calls = report?.instance.calls ?? [];
    const peak = (pick: (o: SharedObjectReport) => number | null): number | null => {
      const values = objects.map(pick).filter((v): v is number => v !== null);
      return values.length === 0 ? null : Math.max(...values);
    };
    return {
      hour: combine(caches.map((c) => c.lastHour)),
      day: combine(caches.map((c) => c.last24h)),
      peakHour: peak((o) => o.lastHourPeakPerSecond),
      peakDay: peak((o) => o.last24hPeakPerSecond),
      p95Ms: calls.length === 0 ? null : Math.max(...calls.map((c) => c.p95Ms)),
      fallbacks: (report?.instance.fallbacks ?? []).reduce((sum, f) => sum + f.count, 0),
      windowMinutes: report?.instance.windowMinutes ?? 0,
    };
  });

  /** Le cache des courbes ; le premier tant que personne n'en a choisi un autre. */
  protected readonly chosen = signal<string | null>(null);
  protected readonly cacheOptions = computed<readonly FoldSelectOption<string>[]>(() =>
    this.caches().map((c) => ({ value: c.cache, label: c.cache })),
  );
  protected readonly selected = computed<SharedCacheSeries | null>(() => {
    const caches = this.caches();
    return caches.find((c) => c.cache === this.chosen()) ?? caches[0] ?? null;
  });

  private readonly window = computed(() => {
    const report = this.report();
    const to = Date.parse(report?.lastHourStartedAt ?? '') + HOUR_MS;
    return { from: to - (report?.days ?? DAYS) * DAY_MS, to };
  });

  protected readonly sizeLine = computed<ChartLine | null>(() => {
    const series = this.selected();
    return series === null
      ? null
      : chartLineOf(
          series.points.map((p) => ({ at: p.hour, value: p.bytes })),
          this.window(),
          CHART_BOX,
        );
  });

  protected readonly rateLine = computed<ChartLine | null>(() => {
    const series = this.selected();
    return series === null
      ? null
      : chartLineOf(
          series.points.map((p) => ({ at: p.hour, value: p.hitRate })),
          this.window(),
          CHART_BOX,
          1,
        );
  });

  protected readonly columns = CACHE_COLUMNS;
  protected readonly fallbackColumns = FALLBACK_COLUMNS;
  protected readonly fallbacks = computed(() => this.report()?.instance.fallbacks ?? []);
  protected readonly fallbackKey = (row: CacheFallbackCount): string => row.store;
  protected readonly noFallback: FoldTableEmpty = {
    title: 'Aucun repli',
    subtitle: "Cette instance n'a relu la base pour aucun cache sur sa fenêtre.",
  };

  protected readonly nothing: FoldTableEmpty = {
    title: 'Aucun cache compté',
    subtitle: "Les objets n'ont rien compté sur la période.",
  };

  protected readonly rowKey = (row: SharedCacheSeries): string => row.cache;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.report.set(await this.ops.caches(DAYS));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
