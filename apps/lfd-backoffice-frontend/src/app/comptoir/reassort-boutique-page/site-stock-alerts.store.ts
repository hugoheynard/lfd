import { computed, inject, Injectable, signal } from '@angular/core';
import type { StockAlertLevel, StockAlertView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { SiteStockAlertsService } from './site-stock-alerts.service';

/**
 * Les alertes vivantes du point ouvert, partagées par la carte d'en-tête et
 * les gestes posés sur chaque ligne de la réception (lot R1b). Fournie par la
 * page : une instance par écran, jamais à la racine.
 */
@Injectable()
export class SiteStockAlertsStore {
  private readonly service = inject(SiteStockAlertsService);

  readonly siteId = signal<string | null>(null);
  readonly alerts = signal<readonly StockAlertView[]>([]);
  readonly pending = signal(false);
  readonly failure = signal<string | null>(null);
  /** La lecture a-t-elle échoué ? Une liste vide ne veut alors rien dire. */
  readonly loadFailed = signal(false);

  readonly bySku = computed(
    () => new Map(this.alerts().map((alert) => [alert.sku, alert] as const)),
  );

  /** Relit les alertes du point ; une réponse d'un point quitté entre-temps est jetée. */
  async load(siteId: string | null): Promise<void> {
    this.siteId.set(siteId);
    if (siteId === null) {
      this.alerts.set([]);
      return;
    }
    try {
      const view = await this.service.list(siteId);
      if (this.siteId() === siteId) {
        this.alerts.set(view.alerts);
        this.loadFailed.set(false);
      }
    } catch {
      this.loadFailed.set(true);
    }
  }

  declare(sku: string, level: StockAlertLevel): Promise<void> {
    return this.act((siteId) => this.service.declare(siteId, sku, level));
  }

  lift(alert: StockAlertView): Promise<void> {
    return this.act((siteId) => this.service.lift(siteId, alert.id));
  }

  /** Un geste, puis la relecture. Un refus laisse la liste servie, avec sa raison. */
  private async act(gesture: (siteId: string) => Promise<void>): Promise<void> {
    const siteId = this.siteId();
    if (siteId === null || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await gesture(siteId);
      await this.load(siteId);
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "L'alerte n'a pas pu être enregistrée."));
    } finally {
      this.pending.set(false);
    }
  }
}
