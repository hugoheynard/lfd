import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import type { IssuedInvoiceSummaryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientInvoices } from '../../../client-invoices.service';
import { ClientLocale } from '../../../client-locale.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { formatCents } from '../../../format-money';
import { InvoiceDialog } from '../invoice-dialog/invoice-dialog';
import { invoiceKind, invoiceMeta, invoicesCount } from '../invoices-section';

/**
 * La carte **« Mes factures »** du bureau (plan
 * `facture-emise.md`) : chaque pièce adressée à la
 * société — numéro, date, période, échéance, TTC — et un clic qui ouvre
 * son dialogue. Lecture PARTAGÉE avec la carte mobile (`ClientInvoices`) ;
 * un échec de lecture se dit, il ne se montre pas comme « aucune facture ».
 */
@Component({
  selector: 'app-invoices-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldEmptyStateComponent, FoldLoadingStateComponent],
  templateUrl: './invoices-desk-card.html',
  styleUrl: './invoices-desk-card.scss',
})
export class InvoicesDeskCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly invoices = inject(ClientInvoices);
  private readonly locale = inject(ClientLocale).current;
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  private readonly companyId = computed(() => this.client.company()?.id ?? null);

  protected readonly count = computed(() =>
    invoicesCount(this.invoices.invoices().length, this.t().account.invoices),
  );
  protected readonly euros = formatCents;

  constructor() {
    effect(() => {
      const id = this.companyId();
      if (id !== null) {
        this.invoices.ensure(id);
      }
    });
  }

  protected kind(invoice: IssuedInvoiceSummaryView): string {
    return invoiceKind(invoice, this.t().account.invoices);
  }

  protected meta(invoice: IssuedInvoiceSummaryView): string {
    return invoiceMeta(invoice, this.t().account.invoices, this.locale());
  }

  protected retry(): void {
    const id = this.companyId();
    if (id !== null) {
      void this.invoices.reload(id);
    }
  }

  protected open(invoice: IssuedInvoiceSummaryView): void {
    const id = this.companyId();
    if (id !== null) {
      InvoiceDialog.open(this.panels, id, invoice.invoiceId);
    }
  }
}
