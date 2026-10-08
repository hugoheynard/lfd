import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { IssuedInvoiceSummaryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientInvoices } from '../../../client-invoices.service';
import { ClientLocale } from '../../../client-locale.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { formatCents } from '../../../format-money';
import { panelSide } from '../../../panel-side';
import { InvoiceDialog } from '../invoice-dialog/invoice-dialog';
import { invoiceKind, invoiceMeta } from '../invoices-section';

/** Charge d'ouverture : la société dont on liste les factures. */
export interface InvoicesPanelData {
  readonly companyId: string;
}

/**
 * Le panneau **« Mes factures »** de la carte mobile : la liste entière (la
 * carte n'en garde que l'essentiel), chaque pièce ouvrant son dialogue
 * empilé. Lit la même source que les cartes (`ClientInvoices`).
 */
@Component({
  selector: 'app-invoices-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldPanelBodyComponent, FoldPanelHeaderComponent],
  templateUrl: './invoices-panel.html',
  styleUrl: './invoices-panel.scss',
})
export class InvoicesPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService, companyId: string): void {
    panels.open<InvoicesPanelData, void>(InvoicesPanel, { side: panelSide(), data: { companyId } });
  }

  readonly data = input.required<InvoicesPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly invoices = inject(ClientInvoices);
  private readonly locale = inject(ClientLocale).current;
  private readonly panels = inject(FoldPanelHostService);

  protected readonly euros = formatCents;

  protected kind(invoice: IssuedInvoiceSummaryView): string {
    return invoiceKind(invoice, this.t().account.invoices);
  }

  protected meta(invoice: IssuedInvoiceSummaryView): string {
    return invoiceMeta(invoice, this.t().account.invoices, this.locale());
  }

  protected open(invoice: IssuedInvoiceSummaryView): void {
    InvoiceDialog.open(this.panels, this.data().companyId, invoice.invoiceId, true);
  }
}
