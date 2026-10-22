import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { UnconfirmedDeliveryView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { day, euros } from '../../invoice-dossier-format';
import { UnconfirmedDeliveriesService } from '../../unconfirmed-deliveries.service';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'order', label: 'Commande' },
  { key: 'company', label: 'Client' },
  { key: 'day', label: 'Jour prévu' },
  { key: 'method', label: 'Mode' },
  { key: 'total', label: 'Montant TTC' },
];

const METHODS: Readonly<Record<UnconfirmedDeliveryView['fulfillmentMethod'], string>> = {
  pickup: 'Retrait',
  delivery: 'Livraison',
};

/**
 * **Les bons à constater** (lot ZL) : un bon au compte n'entre dans une
 * facture qu'une fois sa remise attestée — au comptoir ou à la porte. Ceux
 * dont le jour est passé sans remise ne sont ni facturés ni prélevés ; cette
 * carte les montre pour qu'aucun ne disparaisse en silence. Le geste de
 * sortie est hors d'ici : enregistrer le retrait ou la livraison, ou annuler
 * le bon. Rien n'est rendu quand il n'y en a pas.
 */
@Component({
  selector: 'app-unconfirmed-deliveries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './unconfirmed-deliveries.html',
})
export class UnconfirmedDeliveries {
  private readonly api = inject(UnconfirmedDeliveriesService);

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: UnconfirmedDeliveryView): string => row.orderId;
  protected readonly day = day;
  protected readonly euros = euros;
  protected readonly method = (mode: UnconfirmedDeliveryView['fulfillmentMethod']): string =>
    METHODS[mode];

  protected readonly orders = signal<readonly UnconfirmedDeliveryView[]>([]);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      this.orders.set((await this.api.list()).orders);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Les bons à constater sont illisibles.'));
    }
  }
}
