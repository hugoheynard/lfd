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
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';

import type {
  CacheMetricsReport,
  SharedCacheFigures,
  SharedCacheSeries,
  SharedObjectReport,
} from '@lfd/ops-contract';

import { bytesLabel, chartLineOf, type ChartLine } from '../cache-chart';
import { OpsService } from '../ops.service';

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

/** Le total de plusieurs caches. Les personnes ne s'additionnent pas : on garde le plus fort. */
function combine(figures: readonly SharedCacheFigures[]): {
  readonly hits: number;
  readonly hitRate: number | null;
  readonly persons: number;
  readonly bytes: number | null;
} {
  const hits = figures.reduce((sum, f) => sum + f.hits, 0);
  const reads = hits + figures.reduce((sum, f) => sum + f.misses, 0);
  const sizes = figures.map((f) => f.bytes).filter((b): b is number => b !== null);
  return {
    hits,
    hitRate: reads === 0 ? null : hits / reads,
    persons: Math.max(0, ...figures.map((f) => f.persons)),
    bytes: sizes.length === 0 ? null : sizes.reduce((sum, b) => sum + b, 0),
  };
}

const rate = (value: number | null): string =>
  value === null ? '—' : `${(value * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

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

  protected readonly columns: readonly FoldTableColumn<SharedCacheSeries>[] = [
    { key: 'cache', label: 'Cache', value: (row) => row.cache },
    { key: 'object', label: 'Objet', value: (row) => row.object },
    {
      key: 'rateHour',
      label: 'Réussite (heure)',
      numeric: true,
      value: (row) => rate(row.lastHour.hitRate),
    },
    {
      key: 'rateDay',
      label: 'Réussite (24 h)',
      numeric: true,
      value: (row) => rate(row.last24h.hitRate),
    },
    {
      key: 'hits',
      label: 'Lectures évitées (24 h)',
      numeric: true,
      value: (row) => row.last24h.hits,
    },
    {
      key: 'misses',
      label: 'Relectures (24 h)',
      numeric: true,
      value: (row) => row.last24h.misses,
    },
    {
      key: 'stores',
      label: 'Rangements (24 h)',
      numeric: true,
      value: (row) => row.last24h.stores,
    },
    {
      key: 'tooLarge',
      label: 'Refusés, trop gros',
      numeric: true,
      value: (row) => row.last24h.tooLarge,
    },
    {
      key: 'bytes',
      label: 'Taille rangée',
      numeric: true,
      value: (row) => bytesLabel(row.last24h.bytes),
    },
    { key: 'entries', label: 'Entrées', numeric: true, value: (row) => row.last24h.entries ?? '—' },
    {
      key: 'persons',
      label: 'Personnes servies',
      numeric: true,
      value: (row) => row.last24h.persons,
    },
  ];

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
