import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { MonthlyInvoiceAutopilotRunView, MonthlyInvoicesView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { longDay, monthKeyName, ofMonth } from '../../collection-month-wording';
import { day, euros, instant } from '../../invoice-dossier-format';

const INVOICE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'number', label: 'Facture' },
  { key: 'payer', label: 'Payeur' },
  { key: 'orders', label: 'Bons', numeric: true },
  { key: 'total', label: 'Total TTC', numeric: true },
  { key: 'due', label: 'Échéance' },
  { key: 'mandate', label: 'Mandat (RUM)' },
];

const SIGNAL_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'payer', label: 'Payeur' },
  { key: 'mandate', label: 'Mandat (RUM)' },
  { key: 'message', label: 'Pourquoi la facture n’est pas partie' },
];

export interface MonthlyInvoiceRow {
  readonly key: string;
  readonly number: string;
  readonly payerName: string;
  readonly orderCount: number;
  readonly total: string;
  readonly due: string;
  /** « — » quand aucun mandat unique n'a été figé. */
  readonly mandate: string;
  /** « Émise en retard, le … » quand elle l'a été après le mois ; `null` sinon. */
  readonly late: string | null;
  /** « Bons non facturables : … », ou `null`. */
  readonly unbillable: string | null;
}

export interface MonthlySignalRow {
  readonly key: string;
  readonly payerName: string;
  /** « — » pour la facture des bons sans mandat. */
  readonly mandate: string;
  readonly message: string;
}

/**
 * Une facture émise après le mois porte le jour réel de son émission —
 * jamais antidatée : l'écran le dit, la période facturée reste le mois.
 */
export function lateSentence(issuedOn: string, month: string): string | null {
  return issuedOn.slice(0, 7) > month ? `Émise en retard, le ${day(issuedOn)}` : null;
}

/** La tentative automatique du mois, en une phrase. */
export function autopilotSentence(run: MonthlyInvoiceAutopilotRunView): string {
  const at = instant(run.ranAt);
  const detail = run.message === null ? '' : ` — ${run.message}`;
  switch (run.outcome) {
    case 'issued':
      return `Factures émises automatiquement le ${at}${detail}.`;
    case 'nothing_to_invoice':
      return `Émission automatique tentée le ${at} : rien à facturer${detail}.`;
    case 'not_yet_open':
      return `Émission automatique tentée le ${at} : la facture du mois n’était pas encore en service.`;
    case 'failed':
      return `Émission automatique en échec le ${at}${detail}. Le bouton la reprend.`;
    case 'pending':
      return `Émission automatique commencée le ${at} et interrompue : le bouton la reprend.`;
  }
}

/**
 * **Les factures du mois** (plan `plan-emission-de-la-facture.md`, lot E4) :
 * émises le dernier jour à 23h55, une par payeur légal et par mandat (E4b) ;
 * les factures SIGNALÉES (refusées, avec le geste de sortie) ; le bouton qui émet ou reprend.
 * Le lot du 1er encaisse ces factures — il n'y a plus d'arrêté à figer.
 */
@Component({
  selector: 'app-month-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
  ],
  templateUrl: './month-invoices.html',
  styleUrl: './month-invoices.scss',
})
export class MonthInvoices {
  readonly view = input.required<MonthlyInvoicesView | null>();
  /** L'échec de la lecture : il ne coûte que cette carte. */
  readonly error = input<string | null>(null);
  readonly canWrite = input(false);
  readonly pending = input(false);
  readonly issue = output<string>();

  protected readonly invoiceColumns = INVOICE_COLUMNS;
  protected readonly signalColumns = SIGNAL_COLUMNS;
  protected readonly rowKey = (row: { readonly key: string }): string => row.key;

  /** « septembre ». */
  protected readonly monthName = computed(() => {
    const view = this.view();
    return view === null ? '' : monthKeyName(view.month);
  });

  protected readonly title = computed(() => `Les factures ${ofMonth(this.monthName())}`);

  protected readonly issueLabel = computed(
    () => `Émettre les factures ${ofMonth(this.monthName())}`,
  );

  protected readonly subtitle = computed(() => {
    const view = this.view();
    if (view === null) {
      return '';
    }
    return (
      `Une facture par payeur et par mandat, émise le ${longDay(view.issuableFrom)} à 23h55 ; ` +
      'le lot du 1er les prélève.'
    );
  });

  /** Le mois se clôt avant la mise en service : il garde l'arrêté du lot. */
  protected readonly notYetOpen = computed(() => {
    const view = this.view();
    if (view === null || view.open) {
      return null;
    }
    return view.floorAt === null
      ? 'La date de mise en service de la facture du mois est absente : prévenir la technique.'
      : `La facture du mois est en service à partir du ${longDay(view.floorAt)} ; ` +
          `les bons d’avant gardent l’arrêté de facturation du lot.`;
  });

  protected readonly invoices = computed((): readonly MonthlyInvoiceRow[] => {
    const view = this.view();
    return (view?.invoices ?? []).map((invoice) => ({
      key: invoice.invoiceId,
      number: invoice.number,
      payerName: invoice.payerName,
      orderCount: invoice.orderCount,
      total: euros(invoice.totalCents),
      due: invoice.dueOn === null ? '—' : day(invoice.dueOn),
      mandate: invoice.mandateReference ?? '—',
      late: view === null ? null : lateSentence(invoice.issuedOn, view.month),
      unbillable:
        invoice.unbillableOrders.length === 0
          ? null
          : `Bons non facturables, laissés hors de la facture : ${invoice.unbillableOrders.join(', ')}`,
    }));
  });

  protected readonly signaled = computed((): readonly MonthlySignalRow[] =>
    (this.view()?.signaled ?? []).map((row) => ({
      // Un payeur a une issue PAR MANDAT (E4b) : la RUM complète la clé.
      key: `${row.payerCompanyId}:${row.mandateReference ?? ''}`,
      payerName: row.payerName,
      mandate: row.mandateReference ?? '—',
      message: row.message,
    })),
  );

  protected readonly autopilot = computed(() => {
    const run = this.view()?.autopilotRun ?? null;
    return run === null ? null : autopilotSentence(run);
  });

  protected readonly canIssue = computed(() => this.canWrite() && (this.view()?.open ?? false));

  protected onIssue(): void {
    const view = this.view();
    if (view !== null) {
      this.issue.emit(view.month);
    }
  }
}
