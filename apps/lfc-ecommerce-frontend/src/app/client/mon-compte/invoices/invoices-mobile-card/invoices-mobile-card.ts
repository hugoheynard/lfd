import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientInvoices } from '../../../client-invoices.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { formatCents } from '../../../format-money';
import { CardFoot } from '../../card-foot/card-foot';
import { InvoicesPanel } from '../invoices-panel/invoices-panel';
import { invoicesCount } from '../invoices-section';

/**
 * La carte **« Mes factures »** en pile : le nombre de pièces et la plus
 * récente ; le pied ouvre le panneau de la liste, d'où chaque pièce ouvre
 * son dialogue. Lecture PARTAGÉE avec la carte bureau (`ClientInvoices`).
 */
@Component({
  selector: 'app-invoices-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardFoot, FoldButtonComponent, FoldEmptyStateComponent, FoldLoadingStateComponent],
  templateUrl: './invoices-mobile-card.html',
  styleUrl: './invoices-mobile-card.scss',
})
export class InvoicesMobileCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly invoices = inject(ClientInvoices);
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  private readonly companyId = computed(() => this.client.company()?.id ?? null);

  protected readonly count = computed(() =>
    invoicesCount(this.invoices.invoices().length, this.t().account.invoices),
  );
  /** La liste vient la plus récente d'abord. */
  protected readonly latest = computed(() => this.invoices.invoices()[0] ?? null);
  protected readonly euros = formatCents;

  constructor() {
    effect(() => {
      const id = this.companyId();
      if (id !== null) {
        this.invoices.ensure(id);
      }
    });
  }

  protected retry(): void {
    const id = this.companyId();
    if (id !== null) {
      void this.invoices.reload(id);
    }
  }

  protected open(): void {
    const id = this.companyId();
    if (id !== null) {
      InvoicesPanel.open(this.panels, id);
    }
  }
}
