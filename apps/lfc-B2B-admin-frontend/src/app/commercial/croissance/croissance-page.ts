import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';
import type {
  AccountConcentration,
  AdoptionZoneView,
  GrowthStatsView,
  PenetrationTrendPoint,
  TerminationStatsView,
  ZonePenetrationTrend,
} from '@lfd/contracts';

import { MarketService } from '../market/market.service';
import { CHURN_COLORS } from './churn-palette';
import { Chart, type ChartOption } from '../../shared/chart/chart';
import { Lorenz } from '../../shared/lorenz/lorenz';
import { MetricInfo } from '../../shared/metric-info/metric-info';
import { Sunburst, type SunburstDatum } from '../../shared/sunburst/sunburst';
import {
  acquisitionMixDonutOption,
  acquisitionMixOption,
  acquisitionOption,
  adoptionOption,
  cohortHeatmapOption,
  concentrationSummary,
  funnelOption,
  lifecycleSankeyOption,
  recoveryReactionOption,
  recoveryReactionWeeklyOption,
  recoveryTrendOption,
  temperatureFlowOption,
  temperatureTransitionsOption,
  terminationRecoveryOption,
  velocityBoxplotOption,
  zoneVelocityOption,
} from './growth-charts';
import { GrowthService } from './growth.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Onglets du dashboard, un par type de donnée. */
type TabKey = 'acquisition' | 'marche' | 'retention' | 'vivier' | 'usage';

/** Une tuile KPI. */
interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}

/**
 * Onglet **Croissance** : le dashboard analytique PLG, dérivé du journal (`GET
 * /admin/growth/stats`). Tuiles KPI + acquisition + momentum du vivier (part par
 * chaleur + transferts entre bandes) + entonnoirs (cold & activation) + cycle de vie
 * + vélocité + mix + Lorenz + heatmap de cohortes. Rendus par `<app-chart>` (ECharts) /
 * `<app-lorenz>`
 * (D3), options construites par des fonctions pures. Chaque carte porte une bulle
 * d'aide (`<app-metric-info>`) décrivant sa métrique.
 */
@Component({
  selector: 'app-croissance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chart, Lorenz, Sunburst, MetricInfo, FoldButtonComponent],
  templateUrl: './croissance-page.html',
  styleUrl: './croissance-page.scss',
})
export class CroissancePage {
  private readonly service = inject(GrowthService);
  private readonly market = inject(MarketService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly activeTab = signal<TabKey>('acquisition');
  protected readonly tabs: ReadonlyArray<{ readonly key: TabKey; readonly label: string }> = [
    { key: 'acquisition', label: 'Acquisition' },
    { key: 'marche', label: 'Marché & territoire' },
    { key: 'retention', label: 'Rétention & churn' },
    { key: 'vivier', label: 'Vivier' },
    { key: 'usage', label: 'Usage webapp' },
  ];
  protected readonly stats = signal<GrowthStatsView | null>(null);
  protected readonly adoptionZones = signal<readonly AdoptionZoneView[] | null>(null);
  protected readonly adoptionTrend = signal<readonly PenetrationTrendPoint[] | null>(null);
  protected readonly adoptionZoneTrends = signal<readonly ZonePenetrationTrend[] | null>(null);
  protected readonly terminations = signal<TerminationStatsView | null>(null);

  protected readonly kpis = computed<readonly Kpi[]>(() => {
    const s = this.stats();
    if (s === null) {
      return [];
    }
    const k = s.kpis;
    return [
      {
        label: 'Prospects',
        value: `${k.prospects}`,
        hint: `${k.hot} chauds · ${k.mid} tièdes · ${k.cold} froids`,
      },
      { label: 'Commandes', value: `${k.orders}`, hint: `${euros(k.ordersTotalCents)} au total` },
      { label: 'Leads actifs', value: `${k.activeLeads}`, hint: 'démarchage en cours' },
      {
        label: 'Conversion',
        value: `${Math.round(k.conversionRate * 100)} %`,
        hint: `${k.companiesActivated}/${k.companiesDeclared} sociétés activées`,
      },
    ];
  });

  protected readonly acquisition = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null ? null : acquisitionOption(s.acquisition, this.adoptionTrend() ?? undefined);
  });
  protected readonly adoptionSort = signal<'desc' | 'asc'>('desc');
  protected readonly adoption = computed<ChartOption | null>(() => {
    const zones = this.adoptionZones();
    return zones === null || zones.length === 0
      ? null
      : adoptionOption(zones, this.adoptionSort());
  });
  protected readonly terminationSunburst = computed<readonly SunburstDatum[] | null>(() => {
    const t = this.terminations();
    if (t === null || t.reasons.length === 0) {
      return null;
    }
    return t.reasons.map(toSunburst);
  });
  /** Couleur du sunburst par **libellé de catégorie** — même teinte que le rattrapage. */
  protected readonly terminationColors = computed<ReadonlyMap<string, string> | null>(() => {
    const t = this.terminations();
    if (t === null || t.reasons.length === 0) {
      return null;
    }
    return new Map(t.reasons.map((r) => [r.label, CHURN_COLORS[r.reason]]));
  });
  protected readonly terminationRecovery = computed<ChartOption | null>(() => {
    const t = this.terminations();
    return t === null || t.recovery.attempts === 0 ? null : terminationRecoveryOption(t);
  });
  protected readonly recoveryTrend = computed<ChartOption | null>(() => {
    const t = this.terminations();
    return t === null || t.recoveryTrend.length < 2 ? null : recoveryTrendOption(t.recoveryTrend);
  });
  protected readonly recoveryReaction = computed<ChartOption | null>(() => {
    const t = this.terminations();
    return t === null || t.reactionByReason.length === 0
      ? null
      : recoveryReactionOption(t.reactionByReason);
  });
  protected readonly recoveryReactionWeekly = computed<ChartOption | null>(() => {
    const t = this.terminations();
    return t === null || t.reactionByWeek.series.length === 0
      ? null
      : recoveryReactionWeeklyOption(t.reactionByWeek);
  });
  protected readonly zoneVelocity = computed<ChartOption | null>(() => {
    const trends = this.adoptionZoneTrends();
    if (trends === null || !trends.some((z) => z.points.some((p) => p.penetration > 0))) {
      return null;
    }
    return zoneVelocityOption(trends);
  });
  protected readonly temperatureFlow = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null ? null : temperatureFlowOption(s.temperatureFlow);
  });
  protected readonly transitions = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null || s.temperatureTransitions.links.length === 0
      ? null
      : temperatureTransitionsOption(s.temperatureTransitions);
  });
  protected readonly coldFunnel = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null ? null : funnelOption(s.coldFunnel, '#8b5cf6');
  });
  protected readonly activationFunnel = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null ? null : funnelOption(s.activationFunnel, '#3b82f6');
  });
  protected readonly cohorts = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null || s.cohorts.length === 0 ? null : cohortHeatmapOption(s.cohorts);
  });
  protected readonly lifecycle = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null || s.lifecycle.links.length === 0 ? null : lifecycleSankeyOption(s.lifecycle);
  });
  protected readonly velocity = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null ? null : velocityBoxplotOption(s.velocity);
  });
  protected readonly mix = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null ? null : acquisitionMixOption(s.acquisitionMix);
  });
  protected readonly mixDonut = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null ? null : acquisitionMixDonutOption(s.acquisitionMix);
  });
  protected readonly concentration = computed<AccountConcentration | null>(() => {
    const s = this.stats();
    return s === null || s.concentration.accounts === 0 ? null : s.concentration;
  });
  protected readonly concentrationHint = computed<string>(() => {
    const c = this.concentration();
    return c === null ? '' : concentrationSummary(c);
  });

  constructor() {
    void this.load();
  }

  /** Change le sens de tri de l'adoption par territoire depuis le `<select>`. */
  protected onAdoptionSort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.adoptionSort.set(value === 'asc' ? 'asc' : 'desc');
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.stats.set(await this.service.stats());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
    // Churn (secondaire) : chargé à part, sans faire échouer le dashboard.
    try {
      this.terminations.set(await this.service.terminations());
    } catch {
      this.terminations.set(null);
    }
    // L'adoption est secondaire (dépend d'une config marché) : chargée à part, sans
    // faire échouer le dashboard si elle est absente ou vide.
    try {
      const view = await this.market.adoption();
      this.adoptionZones.set(view.zones);
      this.adoptionTrend.set(view.trend);
      this.adoptionZoneTrends.set(view.zoneTrends);
    } catch {
      this.adoptionZones.set(null);
      this.adoptionTrend.set(null);
      this.adoptionZoneTrends.set(null);
    }
  }
}

/** Nœud de churn labellisé (raison ou sous-raison), profondeur variable. */
interface LabeledCount {
  readonly label: string;
  readonly count: number;
  readonly children?: readonly LabeledCount[];
}

/**
 * Convertit un nœud de churn en datum sunburst : une feuille porte sa valeur, un
 * nœud à enfants porte 0 (D3 `.sum()` additionne les feuilles) et récurse — le 3ᵉ
 * anneau (catégorie produit sous « Meilleur prix ») tombe naturellement.
 */
function toSunburst(node: LabeledCount): SunburstDatum {
  const children = node.children ?? [];
  if (children.length === 0) {
    return { name: node.label, value: node.count };
  }
  return { name: node.label, value: 0, children: children.map(toSunburst) };
}

/** Montant en euros (centimes du contrat). */
function euros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}
