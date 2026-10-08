import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { IssuedInvoiceView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientInvoices } from '../../../client-invoices.service';
import { ClientLocale } from '../../../client-locale.service';
import { ClientCopyService, fill } from '../../../copy/client-copy.service';
import { formatCents, formatRate } from '../../../format-money';
import { downloadBlob } from '../../../mes-commandes/download-blob';
import { dialogSide } from '../../../panel-side';
import {
  basisPoints,
  invoiceDay,
  invoiceKind,
  invoiceMeta,
  invoiceQuantity,
  unitPriceLabel,
} from '../invoices-section';

/** Charge d'ouverture : la société, et la pièce à lire. */
export interface InvoiceDialogData {
  readonly companyId: string;
  readonly invoiceId: string;
}

/**
 * **Une facture**, en lecture seule (plan `plan-emission-de-la-facture.md`,
 * E6) : parties, lignes, ventilation par taux, totaux, mentions, règlement,
 * commandes facturées — tels que la pièce les a figés. Rien n'est recalculé.
 *
 * Un clic sur une facture ouvre ce dialogue directement (règle « Saisir » de
 * l'app : pas de panneau intermédiaire). Le PDF/A-3 Factur-X se télécharge
 * d'ici une fois rendu (E3b) ; tant qu'il ne l'est pas, le dialogue le dit.
 */
@Component({
  selector: 'app-invoice-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './invoice-dialog.html',
  styleUrl: './invoice-dialog.scss',
})
export class InvoiceDialog {
  /** `lg` : une ligne de facture tient ses cinq colonnes sur une rangée. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'lg', surface: 'solid' };

  /** `stack` quand il s'ouvre depuis le panneau de la liste : le panneau reste dessous. */
  static open(
    panels: FoldPanelHostService,
    companyId: string,
    invoiceId: string,
    stack = false,
  ): void {
    panels.open<InvoiceDialogData, void>(InvoiceDialog, {
      side: dialogSide(),
      stack,
      data: { companyId, invoiceId },
    });
  }

  readonly data = input.required<InvoiceDialogData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale).current;
  private readonly invoices = inject(ClientInvoices);

  protected readonly invoice = signal<IssuedInvoiceView | null>(null);
  protected readonly failed = signal(false);
  protected readonly downloading = signal(false);
  protected readonly downloadFailed = signal(false);

  protected readonly copy = computed(() => this.t().account.invoices);
  protected readonly title = computed(() => {
    const invoice = this.invoice();
    return invoice === null
      ? this.t().account.sections.invoices
      : `${invoiceKind(invoice, this.copy())} ${invoice.number}`;
  });
  protected readonly meta = computed(() => {
    const invoice = this.invoice();
    return invoice === null ? '' : invoiceMeta(invoice, this.copy(), this.locale());
  });

  protected readonly euros = formatCents;
  protected readonly rate = formatRate;
  protected readonly quantity = invoiceQuantity;
  protected readonly unitPrice = unitPriceLabel;
  protected readonly percent = basisPoints;

  constructor() {
    effect(() => {
      const { companyId, invoiceId } = this.data();
      untracked(() => void this.load(companyId, invoiceId));
    });
  }

  protected vatRate(rate: number): string {
    return fill(this.copy().vatRate, { rate: formatRate(rate) });
  }

  protected delivered(day: string | null): string {
    return day === null
      ? this.copy().notDelivered
      : fill(this.copy().delivered, { date: invoiceDay(day, this.locale()) });
  }

  protected means(reference: string | null): string {
    return reference === null ? '—' : fill(this.copy().directDebit, { rum: reference });
  }

  /** Télécharge le PDF rangé, nommé d'après le numéro de la pièce. */
  protected async download(invoice: IssuedInvoiceView): Promise<void> {
    this.downloading.set(true);
    this.downloadFailed.set(false);
    try {
      const blob = await this.invoices.document(this.data().companyId, invoice.invoiceId);
      downloadBlob(`${invoice.number}.pdf`, blob);
    } catch {
      this.downloadFailed.set(true);
    } finally {
      this.downloading.set(false);
    }
  }

  private async load(companyId: string, invoiceId: string): Promise<void> {
    this.failed.set(false);
    try {
      this.invoice.set(await this.invoices.one(companyId, invoiceId));
    } catch {
      this.failed.set(true);
    }
  }
}
