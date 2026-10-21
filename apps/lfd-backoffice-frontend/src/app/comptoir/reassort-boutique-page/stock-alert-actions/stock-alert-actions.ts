import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { StockAlertLevel } from '@lfd/contracts';
import { FoldButtonComponent } from 'fold-ng';

import { SiteStockAlertsStore } from '../site-stock-alerts.store';

/**
 * Les trois gestes d'alerte sur un article : « Rupture », « Stock faible »,
 * « Lever ». Le niveau déjà déclaré n'est pas reproposé ; « Lever » n'apparaît
 * que s'il y a une alerte vivante.
 */
@Component({
  selector: 'app-stock-alert-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './stock-alert-actions.html',
  styleUrl: './stock-alert-actions.scss',
})
export class StockAlertActions {
  private readonly store = inject(SiteStockAlertsStore);

  readonly sku = input.required<string>();

  protected readonly pending = this.store.pending;
  protected readonly alert = computed(() => this.store.bySku().get(this.sku()) ?? null);

  protected declare(level: StockAlertLevel): void {
    void this.store.declare(this.sku(), level);
  }

  protected lift(): void {
    const alert = this.alert();
    if (alert !== null) {
      void this.store.lift(alert);
    }
  }
}
