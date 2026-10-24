import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { CollectionExclusionView, CollectionProcedureInvoicesView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

import { CardInvoiceSignals } from '../card-invoice-signals/card-invoice-signals';
import { ExcludedOrders } from '../excluded-orders/excluded-orders';
import { MonthInvoices } from '../month-invoices/month-invoices';
import { UnconfirmedDeliveries } from '../unconfirmed-deliveries/unconfirmed-deliveries';
import { invoicesSentence } from './procedure-invoices-wording';

/**
 * **Onglet 3 — les factures de LA période de la procédure** (Hugo,
 * 2026-10-24). Repris de « Prélèvement du mois », retiré le même jour :
 *
 * 1. les **bons à constater** de la période, en tête — c'est le premier geste ;
 * 2. la **carte de la clôture** : ses factures, ses signalements, ses lots et
 *    « Émettre les factures de … » (rejouable) ;
 * 3. les **bons écartés** du dernier lot, qui se règlent autrement ;
 * 4. les **factures carte** qui ne sont pas parties.
 *
 * L'état et les nombres viennent du serveur (`view`) : rien n'est recalculé
 * ici. Les gestes remontent à la page, qui relit l'état.
 */
@Component({
  selector: 'app-procedure-invoices-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CardInvoiceSignals,
    ExcludedOrders,
    FoldCalloutComponent,
    MonthInvoices,
    UnconfirmedDeliveries,
  ],
  templateUrl: './procedure-invoices-step.html',
  styleUrl: './procedure-invoices-step.scss',
})
export class ProcedureInvoicesStep {
  readonly view = input.required<CollectionProcedureInvoicesView>();
  /** Les bons écartés à la dernière préparation (`CollectionCycleView.exclusions`). */
  readonly exclusions = input<readonly CollectionExclusionView[]>([]);
  readonly canWrite = input(false);
  readonly pending = input(false);

  /** La clôture à émettre (ISO). */
  readonly issue = output<string>();
  readonly settle = output<CollectionExclusionView>();

  protected readonly sentence = computed(() => invoicesSentence(this.view()));
  protected readonly unconfirmedCount = computed(() => this.view().unconfirmedDeliveries.length);
  protected readonly issuedCount = computed(() => this.view().closure?.invoices.length ?? 0);
}
