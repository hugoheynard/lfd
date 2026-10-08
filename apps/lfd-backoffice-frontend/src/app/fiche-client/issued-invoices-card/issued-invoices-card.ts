import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { IssuedInvoiceSummaryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { day, euros } from '../../comptabilite/invoice-dossier-format';
import { kindLabel, periodLabel } from '../../comptabilite/issued-invoice-format';
import { downloadIssuedInvoicePdf } from '../../comptabilite/issued-invoice-pdf';
import { IssuedInvoicesService } from '../../comptabilite/issued-invoices.service';
import { NotifyService } from '../../notify.service';

/**
 * **Les factures émises** de la société — factures et avoirs adressés à ce
 * payeur légal (plan `plan-emission-de-la-facture.md`, E6), les plus
 * récentes d'abord ; chacune mène à sa pièce dans la comptabilité, et son
 * PDF/A-3 Factur-X se télécharge d'ici une fois rendu (E3b).
 *
 * Un site qui suit la facturation de son principal n'a pas de factures à
 * lui : elles sont adressées au principal, et la carte le dit plutôt que de
 * se taire.
 */
@Component({
  selector: 'app-issued-invoices-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './issued-invoices-card.html',
  styleUrl: './issued-invoices-card.scss',
})
export class IssuedInvoicesCard {
  readonly companyId = input.required<string>();

  private readonly service = inject(IssuedInvoicesService);
  private readonly notify = inject(NotifyService);

  protected readonly invoices = signal<readonly IssuedInvoiceSummaryView[] | null>(null);
  protected readonly loadError = signal(false);
  /** La pièce dont le PDF est en cours de téléchargement. */
  protected readonly downloading = signal<string | null>(null);

  protected readonly euros = euros;
  protected readonly day = day;
  protected readonly kind = kindLabel;
  protected readonly period = periodLabel;

  constructor() {
    effect(() => {
      const id = this.companyId();
      untracked(() => void this.load(id));
    });
  }

  protected async download(invoice: IssuedInvoiceSummaryView): Promise<void> {
    this.downloading.set(invoice.invoiceId);
    await downloadIssuedInvoicePdf(this.service, this.notify, invoice);
    this.downloading.set(null);
  }

  protected retry(): void {
    void this.load(this.companyId());
  }

  private async load(companyId: string): Promise<void> {
    this.loadError.set(false);
    try {
      this.invoices.set((await this.service.ofCompany(companyId)).invoices);
    } catch {
      this.loadError.set(true);
    }
  }
}
