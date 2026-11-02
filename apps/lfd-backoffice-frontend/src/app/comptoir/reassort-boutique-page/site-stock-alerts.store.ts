import { computed, inject, Injectable, signal } from '@angular/core';
import type { StockAlertLevel, StockAlertView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { SiteStockAlertsService } from './site-stock-alerts.service';

/**
 * Les alertes vivantes du point ouvert (lot R1b), que la table du réassort
 * lit et pose d'un clic (R1e). Fournie par la page : une instance par écran,
 * jamais à la racine.
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

  /** La file des gestes : chacun attend que le précédent soit écrit et relu. */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Un geste, puis la relecture. Un refus laisse la liste servie, avec sa raison.
   * Un geste posé pendant qu'un autre s'écrit est mis en file, plus jeté en
   * silence (audit du 2026-11-03).
   */
  private act(gesture: (siteId: string) => Promise<void>): Promise<void> {
    const run = this.queue.then(() => this.run(gesture));
    this.queue = run;
    return run;
  }

  private async run(gesture: (siteId: string) => Promise<void>): Promise<void> {
    const siteId = this.siteId();
    if (siteId === null) {
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
