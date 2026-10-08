import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { InvoiceDossierOrderView, InvoiceDossierView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  type FoldTableColumn,
  FoldTimelineComponent,
} from 'fold-ng';

import {
  countOrders,
  day,
  euros,
  historyNodes,
  instant,
  placeLabel,
} from '../../invoice-dossier-format';

/**
 * **Les bons**, tels que figés (plan, § 3.2, § 3.3) : référence, passation,
 * livraison demandée et réelle, lieu, totaux ; puis la frise retrait /
 * livraison de chacun, repliée — on l'ouvre pour vérifier un bon, pas pour lire
 * le dossier.
 */
@Component({
  selector: 'app-dossier-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldTimelineComponent,
  ],
  templateUrl: './dossier-orders.html',
  styleUrl: './dossier-orders.scss',
})
export class DossierOrders {
  readonly dossier = input.required<InvoiceDossierView>();

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'reference', label: 'Bon' },
    { key: 'placed', label: 'Passé le' },
    { key: 'delivery', label: 'Livraison' },
    { key: 'place', label: 'Lieu' },
    { key: 'ht', label: 'Lignes HT', numeric: true },
    { key: 'discounts', label: 'Remises', numeric: true },
    { key: 'fees', label: 'Livraison et surtaxe', numeric: true },
    { key: 'vat', label: 'TVA', numeric: true },
    { key: 'total', label: 'TTC', numeric: true },
  ];

  protected readonly rowKey = (order: InvoiceDossierOrderView): string => order.reference;

  protected readonly count = countOrders;
  protected readonly day = day;
  protected readonly euros = euros;
  protected readonly instant = instant;
  protected readonly place = placeLabel;
  protected readonly nodes = historyNodes;

  protected linesHt(order: InvoiceDossierOrderView): number {
    return order.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  }
}
