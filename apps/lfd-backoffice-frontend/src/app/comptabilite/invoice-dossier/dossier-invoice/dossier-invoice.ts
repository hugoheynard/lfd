import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { InvoiceDossierLineView, InvoiceDossierView } from '@lfd/contracts';
import {
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  type FoldTableColumn,
} from 'fold-ng';

import {
  deliveryModeLabel,
  euros,
  linePeriod,
  partLabel,
  ratePercent,
  unitPrice,
} from '../../invoice-dossier-format';

/**
 * **La facture, calculée en une fois** (plan, § 3.1) : une ligne par produit
 * et par prix, les remises par nature, la livraison par mode, la surtaxe ;
 * puis la ventilation par taux écrite comme un calcul qu'on refait à la main —
 * TVA = base imposable × taux, sur la base arrondie.
 */
@Component({
  selector: 'app-dossier-invoice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './dossier-invoice.html',
  styleUrl: './dossier-invoice.scss',
})
export class DossierInvoice {
  readonly dossier = input.required<InvoiceDossierView>();

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'label', label: 'Produit' },
    { key: 'period', label: 'Livré' },
    { key: 'rate', label: 'TVA', numeric: true },
    { key: 'quantity', label: 'Quantité', numeric: true },
    { key: 'unit', label: 'Prix unitaire HT', numeric: true },
    { key: 'amount', label: 'Montant HT', numeric: true },
  ];

  protected readonly rowKey = (line: InvoiceDossierLineView): string =>
    `${line.sku}|${String(line.unitPriceMillicents)}|${String(line.vatRate)}`;

  protected readonly euros = euros;
  protected readonly unitPrice = unitPrice;
  protected readonly rate = ratePercent;
  protected readonly period = linePeriod;
  protected readonly part = partLabel;
  protected readonly deliveryMode = deliveryModeLabel;
}
