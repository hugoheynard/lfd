import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { GrowthStatsView, OrderMetricsView, TerminationStatsView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Lecture du **dashboard de croissance** — `GET /admin/growth/stats` (KPIs, courbe
 * d'acquisition, entonnoirs, cohortes), dérivé du journal côté backend. Même auth
 * staff que le reste de l'admin (bypass dev). Transport pur.
 */
@Injectable({ providedIn: 'root' })
export class GrowthService {
  private readonly http = inject(HttpClient);

  async stats(): Promise<GrowthStatsView> {
    return this.get<GrowthStatsView>('stats');
  }

  /** Métriques de commande au grain **jour** (CA, volume, récurrent/unique). */
  async orderMetrics(): Promise<OrderMetricsView> {
    return this.get<OrderMetricsView>('order-metrics');
  }

  /** Analytics de churn : raisons de résiliation + taux de rattrapage. */
  async terminations(): Promise<TerminationStatsView> {
    return this.get<TerminationStatsView>('terminations');
  }

  private get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(`${B2B_API_BASE}/admin/growth/${path}`));
  }
}
