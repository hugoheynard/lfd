import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ResupplyArticleView, StockAlertLevel } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  type FoldBadgeVariant,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldComboboxComponent,
  FoldElementTitleComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { parisClock } from '../../../shared/resupply-labels';
import { SiteStockAlertsStore } from '../site-stock-alerts.store';
import { StockAlertActions } from '../stock-alert-actions/stock-alert-actions';

/** Le nom d'un niveau, tel que le comptoir le dit. */
export const STOCK_ALERT_LEVEL_LABELS: Readonly<Record<StockAlertLevel, string>> = {
  out_of_stock: 'Rupture',
  low: 'Stock faible',
};

const LEVEL_VARIANTS: Readonly<Record<StockAlertLevel, FoldBadgeVariant>> = {
  out_of_stock: 'alert',
  low: 'warning',
};

/**
 * **Rupture et stock faible** — en tête de la page Réassort (lot R1b,
 * `reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-21) : les alertes
 * vivantes du point, et la déclaration sur n'importe quel article du
 * catalogue. Elles avertissent le fournil ; elles n'ont encore aucun effet
 * sur la boutique ni sur la passation (J2) — la carte le dit.
 */
@Component({
  selector: 'app-stock-alerts-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldComboboxComponent,
    FoldElementTitleComponent,
    StockAlertActions,
  ],
  templateUrl: './stock-alerts-card.html',
  styleUrl: './stock-alerts-card.scss',
})
export class StockAlertsCard {
  private readonly store = inject(SiteStockAlertsStore);

  readonly articles = input.required<readonly ResupplyArticleView[]>();
  readonly canWrite = input.required<boolean>();

  protected readonly alerts = this.store.alerts;
  protected readonly failure = this.store.failure;
  protected readonly loadFailed = this.store.loadFailed;
  protected readonly levelLabels = STOCK_ALERT_LEVEL_LABELS;
  protected readonly levelVariants = LEVEL_VARIANTS;
  protected readonly declaredAt = parisClock;

  protected readonly pickedSku = signal<string | null>(null);
  protected readonly options = computed<FoldSelectOption<string>[]>(() =>
    this.articles().map((article) => ({
      value: article.sku,
      label: `${article.name} · ${article.sku}`,
    })),
  );
}
