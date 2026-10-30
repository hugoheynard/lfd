import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { formatCents } from '@lfd/b2b-ui/order';
import {
  DEFAULT_MADE_TO_ORDER_MONTH_WINDOW,
  instantToLocal,
  type MadeToOrderByClientView,
  type MadeToOrderClient,
  type MadeToOrderMonthWindow,
  type MadeToOrderMonthlyView,
} from '@lfd/contracts';
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
  FoldViewToggleComponent,
} from 'fold-ng';

import {
  ARTICLE_COLUMNS,
  currentMonthPeriod,
  MONTH_COLUMNS,
  MONTH_WINDOW_OPTIONS,
  monthWindowOf,
} from '../made-to-order-format';
import { MadeToOrderReportsService } from '../made-to-order-reports.service';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Analytics › Sur mesure** — les deux rapports du lot R
 * (`documentation/catalogue/plan-sur-mesure-partout.md`, § 5 ter), sous
 * `b2b_growth:read`.
 *
 * Par mois : le HT sur mesure et sa part du HT de toutes les lignes. Par
 * client : ses articles sur mesure sur une période choisie. Les lignes
 * d'avant le suivi ont leur colonne : l'écran ne les range jamais dans le
 * « non sur mesure ».
 */
@Component({
  selector: 'app-made-to-order-page',
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
    FoldViewToggleComponent,
  ],
  templateUrl: './made-to-order-page.html',
  styleUrl: './made-to-order-page.scss',
})
export class MadeToOrderPage {
  private readonly api = inject(MadeToOrderReportsService);

  protected readonly windowOptions = MONTH_WINDOW_OPTIONS;
  protected readonly monthColumns = MONTH_COLUMNS;
  protected readonly articleColumns = ARTICLE_COLUMNS;
  protected readonly cents = formatCents;
  protected readonly monthKey = (row: { readonly month: string }): string => row.month;
  protected readonly articleKey = (row: {
    readonly sku: string;
    readonly saleUnit: string;
  }): string => `${row.sku}:${row.saleUnit}`;

  protected readonly months = signal<MadeToOrderMonthWindow>(DEFAULT_MADE_TO_ORDER_MONTH_WINDOW);
  protected readonly monthlyState = signal<LoadState>('loading');
  protected readonly monthly = signal<MadeToOrderMonthlyView | null>(null);

  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly clientsState = signal<LoadState>('loading');
  protected readonly clients = signal<MadeToOrderByClientView | null>(null);
  /** Le refus du serveur sur la période (400), dit tel quel. */
  protected readonly periodRefusal = signal<string | null>(null);

  constructor() {
    const period = currentMonthPeriod(instantToLocal(new Date()).day);
    this.from.set(period.from);
    this.to.set(period.to);
    void this.loadMonthly();
    void this.loadClients();
  }

  protected async loadMonthly(): Promise<void> {
    this.monthlyState.set('loading');
    try {
      this.monthly.set(await this.api.monthly(this.months()));
      this.monthlyState.set('ready');
    } catch {
      this.monthlyState.set('error');
    }
  }

  protected chooseWindow(value: string): void {
    const months = monthWindowOf(value);
    if (months === null || months === this.months()) {
      return;
    }
    this.months.set(months);
    void this.loadMonthly();
  }

  protected async loadClients(): Promise<void> {
    this.clientsState.set('loading');
    this.periodRefusal.set(null);
    try {
      this.clients.set(await this.api.byClient(this.from(), this.to()));
      this.clientsState.set('ready');
    } catch (error: unknown) {
      const refusal = refusalOf(error);
      if (refusal === null) {
        this.clientsState.set('error');
        return;
      }
      this.periodRefusal.set(refusal);
      this.clientsState.set('ready');
    }
  }

  protected hasUnknown(view: MadeToOrderMonthlyView): boolean {
    return view.rows.some((row) => row.unknownHtCents > 0);
  }

  protected clientSubtitle(client: MadeToOrderClient): string {
    const parts = [client.kind === 'person' ? 'Particulier' : 'Société'];
    if (client.principalName !== null) {
      parts.push(`rattachée à ${client.principalName}`);
    }
    parts.push(`${formatCents(client.madeToOrderHtCents)} HT sur mesure`);
    return parts.join(' · ');
  }
}

/** Le message d'un refus 400 du serveur, ou `null` pour une autre panne. */
function refusalOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('status' in error) || error.status !== 400) {
    return null;
  }
  const body = 'error' in error ? error.error : null;
  if (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
  ) {
    return body.message;
  }
  return 'La période demandée ne se lit pas : vérifiez les deux dates.';
}
