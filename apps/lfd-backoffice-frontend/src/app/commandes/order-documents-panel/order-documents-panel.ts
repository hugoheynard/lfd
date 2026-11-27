import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SectionTitle, orderDocuments, type OrderDocument } from '@lfd/b2b-ui/order';
import { orderDocumentFileName, type AdminOrderView } from '@lfd/contracts';
import { FoldButtonComponent } from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { PdfPrinter } from '../../shared/print-pdf/pdf-printer';
import { isOrderSheet } from '../commande-page/order-sheet-key';
import { orderDocumentCustomer } from '../order-document-customer';
import { DocumentRow } from '../document-row/document-row';
import { HandoverProofCard } from '../handover-proof-card/handover-proof-card';
import { OrderDeliveryNotesCard } from '../order-delivery-notes-card/order-delivery-notes-card';
import { OrderInvoicesCard } from '../order-invoices-card/order-invoices-card';
import { OrderMailsCard } from '../order-mails-card/order-mails-card';
import { OrderSalesTermsCard } from '../order-sales-terms-card/order-sales-terms-card';
import { AdminOrdersService } from '../orders.service';

/**
 * **L'onglet « Documents » d'une commande** — une seule liste, rangée par
 * groupes, chaque ligne sur le même modèle (`app-document-row`) :
 *
 * - **Pièces** : la confirmation de commande, les bons de livraison, la
 *   facture et les avoirs — chacune « Télécharger » et « Imprimer » ; une
 *   pièce qui n'existe pas encore dit pourquoi, sans bouton ;
 * - **Envois** : chaque e-mail, son objet, sa date, son étape ;
 * - **Conditions** : les CGV de la commande, avec leur PDF ;
 * - **Preuve** : la preuve de livraison, s'il y en a une.
 *
 * Un groupe sans ligne ne s'affiche pas. Au bureau, les pièces à gauche, le
 * reste à droite ; plus étroit, une seule colonne.
 */
@Component({
  selector: 'app-order-documents-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DocumentRow,
    FoldButtonComponent,
    HandoverProofCard,
    NgTemplateOutlet,
    OrderDeliveryNotesCard,
    OrderInvoicesCard,
    OrderMailsCard,
    OrderSalesTermsCard,
    SectionTitle,
  ],
  templateUrl: './order-documents-panel.html',
  styleUrl: './order-documents-panel.scss',
})
export class OrderDocumentsPanel {
  readonly order = input.required<AdminOrderView>();
  /** Avancé après une décision de départ : les bons de livraison se relisent. */
  readonly notesRefresh = input(0);

  private readonly api = inject(AdminOrdersService);
  private readonly printer = inject(PdfPrinter);
  private readonly notify = inject(NotifyService);

  private readonly documents = computed<readonly OrderDocument[]>(() =>
    orderDocuments(this.order()),
  );
  /** La confirmation de commande, en tête des pièces. */
  protected readonly sheet = computed(() => this.documents().filter((d) => isOrderSheet(d.key)));
  /** Les autres pièces de la commande elle-même (la facture du mois), après les bons et factures. */
  protected readonly others = computed(() => this.documents().filter((d) => !isOrderSheet(d.key)));
  /** Le client que les documents impriment — il entre dans le nom des fichiers. */
  protected readonly customerName = computed(() => orderDocumentCustomer(this.order()));

  protected download(key: string): void {
    void this.withSheet(key, (blob, order) => {
      this.printer.download(
        blob,
        orderDocumentFileName(order.orderNumber, orderDocumentCustomer(order), 'confirmation'),
      );
    });
  }

  protected print(key: string): void {
    void this.withSheet(key, (blob) => {
      this.printer.print(blob);
    });
  }

  /**
   * Le bon de commande est la seule pièce de la commande elle-même qui existe
   * en PDF : c'est le MÊME document que celui du client, sous la même clé
   * d'archive. La facture du mois n'a pas de bouton — elle est indisponible.
   */
  private async withSheet(
    key: string,
    use: (blob: Blob, order: AdminOrderView) => void,
  ): Promise<void> {
    const order = this.order();
    if (!isOrderSheet(key)) {
      return;
    }
    try {
      use(await this.api.sheetPdf(order.id), order);
    } catch {
      this.notify.error("La confirmation de commande n'a pas pu être lue.");
    }
  }
}
