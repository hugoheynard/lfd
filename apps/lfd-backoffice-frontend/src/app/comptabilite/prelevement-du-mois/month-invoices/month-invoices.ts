import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  instantToLocal,
  type MonthlyClosureBatchView,
  type MonthlyClosureView,
  type MonthlyInvoiceAutopilotRunView,
} from '@lfd/contracts';
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

import { longDay, periodWithModes } from '../../collection-month-wording';
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
  /** « Émise en retard, le … » quand elle l'a été après la période ; `null` sinon. */
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

/** L'état d'un lot dans la carte d'une clôture — les mots de l'écran, pas ceux de la banque. */
const BATCH_STATE: Readonly<Record<MonthlyClosureBatchView['status'], string>> = {
  constituted: 'préparé, à déposer',
  deposited: 'déposé',
  cancelled: 'annulé',
};

/** « Lot du 1er au 4 octobre 2026 — B2B : préparé, à déposer, 2 ligne(s), 211,00 € ». */
export function batchSentence(batch: MonthlyClosureBatchView): string {
  return (
    `Lot ${batch.periodLabel} — ${batch.scheme} : ${BATCH_STATE[batch.status]}, ` +
    `${String(batch.lineCount)} ligne(s), ${euros(batch.totalCents)}`
  );
}

/**
 * Une facture émise après le dernier jour de sa période porte le jour réel de
 * son émission — jamais antidatée : l'écran le dit, la période reste la même.
 *
 * @param lastDay `AAAA-MM-JJ`, la veille de la clôture (R3).
 */
export function lateSentence(issuedOn: string, lastDay: string): string | null {
  return issuedOn > lastDay ? `Émise en retard, le ${day(issuedOn)}` : null;
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
      return `Émission automatique tentée le ${at} : la facture par période n’était pas encore en service.`;
    case 'failed':
      return `Émission automatique en échec le ${at}${detail}. Le bouton la reprend.`;
    case 'pending':
      return `Émission automatique commencée le ${at} et interrompue : le bouton la reprend.`;
  }
}

/** `AAAA-MM-JJ` — le dernier jour (Paris) de la période : la veille de sa clôture. */
export function periodLastDay(periodClosesAtIso: string): string {
  return instantToLocal(new Date(new Date(periodClosesAtIso).getTime() - 1)).day;
}

/**
 * **Les factures de la période** (plan `facture-emise.md` ; par clôture depuis R3) :
 * émises la veille de la clôture à 23h55, une par payeur légal et par mandat (E4b) ;
 * les factures SIGNALÉES (refusées, avec le geste de sortie) ; le bouton qui émet ou reprend.
 * Le lot du 1er encaisse ces factures — il n'y a plus d'arrêté à figer.
 *
 * Depuis M4c (plan `plan-rythme-de-facturation.md`, §16.13), une carte par
 * CLÔTURE : son titre dit les modes qui y closent quand ils sont mêlés, et
 * elle nomme ses lots. Le bouton n'émet qu'une clôture dont l'heure est passée.
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
  readonly view = input.required<MonthlyClosureView | null>();
  /** La clôture du lot à préparer : la carte le dit dans son titre. */
  readonly toPrepare = input(false);
  /** L'échec de la lecture : il ne coûte que cette carte. */
  readonly error = input<string | null>(null);
  readonly canWrite = input(false);
  readonly pending = input(false);
  readonly issue = output<string>();

  protected readonly invoiceColumns = INVOICE_COLUMNS;
  protected readonly signalColumns = SIGNAL_COLUMNS;
  protected readonly rowKey = (row: { readonly key: string }): string => row.key;

  /** « du 1er au 30 septembre 2026 » — la période de la dernière clôture (R3). */
  protected readonly periodLabel = computed(() => this.view()?.periodLabel ?? '');

  protected readonly title = computed(() => {
    const view = this.view();
    const period = view === null ? '' : periodWithModes(view.periodLabel, view.modes);
    return `Les factures ${period}`;
  });

  protected readonly issueLabel = computed(() => `Émettre les factures ${this.periodLabel()}`);

  protected readonly subtitle = computed(() => {
    const view = this.view();
    if (view === null) {
      return '';
    }
    const lead = this.toPrepare() ? 'La clôture du lot à préparer. ' : '';
    return (
      `${lead}Clôture du ${longDay(view.periodClosesAt)}. Une facture par payeur et par mandat, ` +
      `émise le ${longDay(view.issuableFrom)} à 23h55 ; le lot de la clôture les prélève.`
    );
  });

  /** Les lots de cette clôture, en une phrase chacun. */
  protected readonly batches = computed(() =>
    (this.view()?.batches ?? []).map((batch) => ({
      key: batch.batchId,
      text: batchSentence(batch),
    })),
  );

  /** Pourquoi la clôture n'a pas de lot — jamais un vide muet. */
  protected readonly noBatch = computed(() => {
    const view = this.view();
    if (view === null) {
      return '';
    }
    return view.reached
      ? 'Aucun lot préparé pour cette clôture.'
      : `Le lot se prépare après la clôture du ${longDay(view.periodClosesAt)}.`;
  });

  /** Le mois se clôt avant la mise en service : il garde l'arrêté du lot. */
  protected readonly notYetOpen = computed(() => {
    const view = this.view();
    if (view === null || view.open) {
      return null;
    }
    return view.floorAt === null
      ? 'La date de mise en service de la facture par période est absente : prévenir la technique.'
      : `La facture par période est en service à partir du ${longDay(view.floorAt)} ; ` +
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
      late:
        view === null ? null : lateSentence(invoice.issuedOn, periodLastDay(view.periodClosesAt)),
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

  protected readonly canIssue = computed(() => {
    const view = this.view();
    return this.canWrite() && view !== null && view.open && view.reached;
  });

  protected onIssue(): void {
    const view = this.view();
    if (view !== null) {
      this.issue.emit(view.periodClosesAt);
    }
  }
}
