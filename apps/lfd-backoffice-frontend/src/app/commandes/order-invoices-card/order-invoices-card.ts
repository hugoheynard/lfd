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
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { day, euros } from '../../comptabilite/invoice-dossier-format';
import { kindLabel } from '../../comptabilite/issued-invoice-format';
import { IssuedInvoicesService } from '../../comptabilite/issued-invoices.service';
import { NotifyService } from '../../notify.service';
import { PdfPrinter } from '../../shared/print-pdf/pdf-printer';
import { DocumentRow } from '../document-row/document-row';

/**
 * **La facture et les avoirs** d'une commande, en lignes de l'onglet
 * « Documents » (groupe Pièces), chacun téléchargeable et imprimable (plan
 * `facture-carte-et-remboursements.md`) : la facture qui porte
 * le bon — carte ou du mois — et les avoirs qui la corrigent, chacun mené à
 * sa pièce dans la comptabilité.
 *
 * Rien n'est rendu sans pièce, comme les remboursements : la carte n'existe
 * que si elle a quelque chose à dire. Sous `b2b_accounting:read` : sans ce
 * droit, elle ne rend rien et n'appelle rien — le serveur refuserait, et une
 * carte en erreur sur chaque commande ressemblerait à une panne.
 */
@Component({
  selector: 'app-order-invoices-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DocumentRow, FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './order-invoices-card.html',
  styleUrl: './order-invoices-card.scss',
})
export class OrderInvoicesCard {
  readonly orderId = input.required<string>();

  private readonly service = inject(IssuedInvoicesService);
  private readonly permissions = inject(PermissionsStore);
  private readonly printer = inject(PdfPrinter);
  private readonly notify = inject(NotifyService);

  protected readonly invoices = signal<readonly IssuedInvoiceSummaryView[]>([]);
  protected readonly loadError = signal(false);

  /** « Facture du 12 nov. 2026 · corrige FA-… · 197,34 € ». */
  protected meta(invoice: IssuedInvoiceSummaryView): string {
    const corrects =
      invoice.correctedInvoiceNumber === null ? '' : ` · corrige ${invoice.correctedInvoiceNumber}`;
    const pdf = invoice.documentAvailable ? '' : ' · PDF pas encore disponible';
    return `${kindLabel(invoice.kind)} du ${day(invoice.issuedOn)}${corrects} · ${euros(invoice.totalTtcCents)}${pdf}`;
  }

  protected download(invoice: IssuedInvoiceSummaryView): void {
    void this.withPdf(invoice, (blob) => {
      this.printer.download(blob, `${invoice.number}.pdf`);
    });
  }

  protected print(invoice: IssuedInvoiceSummaryView): void {
    void this.withPdf(invoice, (blob) => {
      this.printer.print(blob);
    });
  }

  private async withPdf(
    invoice: IssuedInvoiceSummaryView,
    use: (blob: Blob) => void,
  ): Promise<void> {
    try {
      use(await this.service.document(invoice.invoiceId));
    } catch (error) {
      this.notify.error(error, `Le PDF de la pièce ${invoice.number} n’a pas pu être lu.`);
    }
  }

  constructor() {
    effect(() => {
      const id = this.orderId();
      const allowed = this.permissions.can('b2b_accounting:read');
      untracked(() => {
        if (allowed) {
          void this.load(id);
        }
      });
    });
  }

  protected retry(): void {
    void this.load(this.orderId());
  }

  private async load(orderId: string): Promise<void> {
    this.loadError.set(false);
    try {
      this.invoices.set((await this.service.ofOrder(orderId)).invoices);
    } catch {
      this.loadError.set(true);
    }
  }
}
