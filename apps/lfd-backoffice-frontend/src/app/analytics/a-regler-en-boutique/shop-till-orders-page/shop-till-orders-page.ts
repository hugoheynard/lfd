import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { instantToLocal, type ShopTillOrdersReportView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { currentMonthPeriod } from '../../sur-mesure/made-to-order-format';
import { SHOP_TILL_COLUMNS, shopTillRowKey } from '../shop-till-orders-format';
import { ShopTillOrdersService } from '../shop-till-orders.service';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Analytics › À régler en boutique** — les commandes notées au comptoir,
 * réglées à la caisse de la boutique (`plan-commande-particulier-reglee-en-boutique.md`,
 * § 4.2), sous `b2b_growth:read`.
 *
 * Un suivi À PART : le CA web ne les compte pas, et aucun total d'ici ne s'y
 * ajoute. Les montants sont commandés et remis, jamais encaissés — la caisse
 * de la boutique encaisse, notre système ne le sait pas.
 */
@Component({
  selector: 'app-shop-till-orders-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './shop-till-orders-page.html',
  styleUrl: './shop-till-orders-page.scss',
})
export class ShopTillOrdersPage {
  private readonly api = inject(ShopTillOrdersService);

  protected readonly columns = SHOP_TILL_COLUMNS;
  protected readonly rowKey = shopTillRowKey;
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly state = signal<LoadState>('loading');
  protected readonly report = signal<ShopTillOrdersReportView | null>(null);
  /** Le refus du serveur sur la période (400), dit tel quel ; le dernier rapport reste. */
  protected readonly refusal = signal<string | null>(null);

  constructor() {
    const period = currentMonthPeriod(instantToLocal(new Date()).day);
    this.from.set(period.from);
    this.to.set(period.to);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.refusal.set(null);
    if (this.report() === null) {
      this.state.set('loading');
    }
    try {
      this.report.set(await this.api.report(this.from(), this.to()));
      this.state.set('ready');
    } catch (error: unknown) {
      if (isBadRequest(error)) {
        this.refusal.set(httpErrorMessage(error, 'La période ne se lit pas : vérifiez les dates.'));
        this.state.set('ready');
        return;
      }
      this.state.set('error');
    }
  }
}

function isBadRequest(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 400;
}
