import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { UnpaidTransferInvoiceView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPageLayoutComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { BankTransfersService } from '../bank-transfers.service';
import { day, euros } from '../invoice-dossier-format';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'payer', label: 'Client' },
  { key: 'invoice', label: 'Facture' },
  { key: 'entity', label: 'Entité émettrice' },
  { key: 'due', label: 'Échéance' },
  { key: 'late', label: 'Retard' },
  { key: 'amount', label: 'Montant', numeric: true },
];

/**
 * **Comptabilité › Virements en retard** (plan
 * `le-paiement-par-virement.md`, V8, C7) : les factures au
 * virement non réglées après leur échéance, toutes entités, les plus en
 * retard d'abord. On SIGNALE seulement : aucun blocage automatique (Q2). Le
 * virement reçu se saisit depuis la fiche du client, onglet Facturation.
 */
@Component({
  selector: 'app-virements-en-retard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './virements-en-retard-page.html',
})
export class VirementsEnRetardPage {
  private readonly api = inject(BankTransfersService);

  protected readonly rows = signal<readonly UnpaidTransferInvoiceView[]>([]);
  protected readonly overdueCents = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly columns = COLUMNS;
  protected readonly euros = euros;
  protected readonly day = day;
  protected readonly empty = computed(() => !this.loading() && this.rows().length === 0);
  protected readonly rowKey = (row: UnpaidTransferInvoiceView): string => row.invoiceId;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const view = await this.api.unpaid({ overdueOnly: true });
      this.rows.set(view.invoices);
      this.overdueCents.set(view.overdueCents);
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les virements en retard sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  // Le contexte d'un `foldCell` n'est pas typé : on entre par une méthode qui
  // rend la ligne typée.
  protected of(row: UnpaidTransferInvoiceView): UnpaidTransferInvoiceView {
    return row;
  }
}
