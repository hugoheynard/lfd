import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CardInvoiceOutcome, CardInvoiceSignalView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { CardInvoicesService } from '../../card-invoices.service';
import { instant } from '../../invoice-dossier-format';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'order', label: 'Commande' },
  { key: 'payer', label: 'Payeur' },
  { key: 'message', label: 'Pourquoi la facture n’est pas partie' },
  { key: 'at', label: 'Dernier essai' },
  { key: 'retry', label: 'Geste' },
];

/** Ce que « Réessayer » a donné, en une phrase. */
const RETRIED: Readonly<Record<CardInvoiceOutcome, string>> = {
  issued: 'Facture émise',
  blocked: 'Toujours signalée',
  already_invoiced: 'Déjà facturée',
  not_card: 'Pas une commande carte : rien à facturer',
  awaiting_payment: 'Pas encore payée : la facture partira à l’encaissement',
  awaiting_handover: 'Pas encore retirée : la facture partira au retrait',
  fully_refunded: 'Remboursée en totalité : pas de facture',
};

/**
 * **Les factures carte signalées** (plan
 * `facture-carte-et-remboursements.md`) : une commande pro
 * payée par carte et retirée dont la facture n'a pas pu partir — acheteur
 * sans SIREN ou sans TVA, pas d'émetteur… Chaque ligne dit pourquoi ; une fois
 * la fiche corrigée, « Réessayer » la rejoue.
 *
 * Ces factures ne sont pas prélevées : elles sont acquittées. La carte vit
 * pourtant ici, à côté des factures du mois, parce que c'est l'écran où l'on
 * vient voir ce qui n'est pas parti. Rien n'est rendu sans signalement.
 */
@Component({
  selector: 'app-card-invoice-signals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './card-invoice-signals.html',
})
export class CardInvoiceSignals {
  readonly canWrite = input(false);

  private readonly api = inject(CardInvoicesService);
  private readonly notify = inject(NotifyService);

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: CardInvoiceSignalView): string => row.orderId;
  protected readonly at = instant;

  protected readonly signaled = signal<readonly CardInvoiceSignalView[]>([]);
  protected readonly error = signal<string | null>(null);
  /** La commande dont on rejoue la facture. */
  protected readonly retrying = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async retry(row: CardInvoiceSignalView): Promise<void> {
    this.retrying.set(row.orderId);
    try {
      const result = await this.api.retry(row.orderId);
      const said = `${row.orderNumber} — ${RETRIED[result.outcome]}`;
      if (result.outcome === 'blocked') {
        this.notify.info(`${said} : ${result.message ?? ''}`);
      } else {
        this.notify.success(result.number === null ? said : `${said} (${result.number}).`);
      }
      await this.load();
    } catch (caught) {
      this.notify.error(caught, 'La facture n’a pas pu être rejouée.');
    } finally {
      this.retrying.set(null);
    }
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      this.signaled.set((await this.api.signals()).signaled);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Les factures carte signalées sont illisibles.'));
    }
  }
}
