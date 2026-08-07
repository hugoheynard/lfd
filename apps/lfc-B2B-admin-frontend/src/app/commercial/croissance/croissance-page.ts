import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';
import type { GrowthStatsView } from '@lfd/contracts';

import type { AccountConcentration } from '@lfd/contracts';

import { Chart, type ChartOption } from '../../shared/chart/chart';
import { Lorenz } from '../../shared/lorenz/lorenz';
import { MetricInfo } from '../../shared/metric-info/metric-info';
import {
  acquisitionMixOption,
  acquisitionOption,
  cohortHeatmapOption,
  concentrationSummary,
  funnelOption,
  lifecycleSankeyOption,
  temperatureFlowOption,
  velocityBoxplotOption,
} from './growth-charts';
import { GrowthService } from './growth.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Une tuile KPI. */
interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}

/**
 * Onglet **Croissance** : le dashboard analytique PLG, dérivé du journal (`GET
 * /admin/growth/stats`). Tuiles KPI + acquisition + momentum du vivier (flux par
 * chaleur) + entonnoirs (cold & activation) + cycle de vie + vélocité + mix + Lorenz
 * + heatmap de cohortes. Graphes rendus par `<app-chart>` (ECharts) / `<app-lorenz>`
 * (D3), options construites par des fonctions pures. Chaque carte porte une bulle
 * d'aide (`<app-metric-info>`) décrivant sa métrique.
 */
@Component({
  selector: 'app-croissance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chart, Lorenz, MetricInfo, FoldButtonComponent],
  templateUrl: './croissance-page.html',
  styleUrl: './croissance-page.scss',
})
export class CroissancePage {
  private readonly service = inject(GrowthService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly stats = signal<GrowthStatsView | null>(null);

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
    return s === null ? null : acquisitionOption(s.acquisition);
  });
  protected readonly temperatureFlow = computed<ChartOption | null>(() => {
    const s = this.stats();
    return s === null ? null : temperatureFlowOption(s.temperatureFlow);
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

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.stats.set(await this.service.stats());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}

/** Montant en euros (centimes du contrat). */
function euros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}
