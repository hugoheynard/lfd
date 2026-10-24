import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { CollectionProcedureInvoicesView, ProcedureOrderStatusView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { CardInvoiceSignals } from '../card-invoice-signals/card-invoice-signals';
import { MonthInvoices } from '../month-invoices/month-invoices';
import { ProcedureOrders } from '../procedure-orders/procedure-orders';
import {
  FIGURE_LABELS,
  FIGURE_ORDER,
  figureOf,
  invoicesSentence,
  issueLabel,
} from './procedure-invoices-wording';

/**
 * **Onglet 3 — les factures de LA période de la procédure** (Hugo,
 * 2026-10-24, refondu le même jour) :
 *
 * 1. une phrase d'état et trois chiffres clés, qui filtrent la liste ;
 * 2. « Émettre les factures des réceptions confirmées (N) », seulement si N > 0 ;
 * 3. UNE liste des commandes de la période, un statut chacune ;
 * 4. la carte de la clôture (ses factures, ses signalements, ses lots) ;
 * 5. les factures carte qui ne sont pas parties.
 *
 * Les commandes écartées du lot vivent dans l'onglet « Fichier de
 * prélèvement ». L'état, les statuts et les nombres viennent du serveur
 * (`view`) : rien n'est recalculé ici. « Émettre » remonte à la page, qui
 * appelle l'émission de la période et relit l'état.
 */
@Component({
  selector: 'app-procedure-invoices-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CardInvoiceSignals,
    FoldButtonComponent,
    FoldCalloutComponent,
    MonthInvoices,
    ProcedureOrders,
  ],
  templateUrl: './procedure-invoices-step.html',
  styleUrl: './procedure-invoices-step.scss',
})
export class ProcedureInvoicesStep {
  readonly view = input.required<CollectionProcedureInvoicesView>();
  readonly canWrite = input(false);
  readonly pending = input(false);

  /** La clôture à émettre (ISO). */
  readonly issue = output<string>();

  /** Le statut qui filtre la liste ; `null` : toutes. */
  protected readonly filter = signal<ProcedureOrderStatusView | null>(null);

  protected readonly sentence = computed(() => invoicesSentence(this.view()));

  protected readonly figures = computed(() =>
    FIGURE_ORDER.map((status) => ({
      status,
      count: figureOf(this.view().figures, status),
      label: FIGURE_LABELS[status],
    })),
  );

  protected readonly orders = computed(() => {
    const active = this.filter();
    const all = this.view().orders;
    return active === null ? all : all.filter((order) => order.status === active);
  });

  /** La clôture émettable : atteinte, en service, et des réceptions confirmées à facturer. */
  protected readonly issuable = computed(() => {
    const closure = this.view().closure;
    const count = this.view().issuableCount;
    return this.canWrite() && closure !== null && closure.open && closure.reached && count > 0
      ? { closesAt: closure.periodClosesAt, label: issueLabel(count) }
      : null;
  });

  protected onIssue(closesAt: string): void {
    this.issue.emit(closesAt);
  }

  protected toggle(status: ProcedureOrderStatusView): void {
    this.filter.update((active) => (active === status ? null : status));
  }
}
