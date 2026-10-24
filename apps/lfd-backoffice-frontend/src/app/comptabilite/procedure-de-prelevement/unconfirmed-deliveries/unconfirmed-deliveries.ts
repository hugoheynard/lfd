import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { UnconfirmedDeliveryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { day, euros } from '../../invoice-dossier-format';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'order', label: 'Commande' },
  { key: 'company', label: 'Client' },
  { key: 'day', label: 'Jour prévu' },
  { key: 'missing', label: 'Ce qui manque' },
  { key: 'total', label: 'Montant TTC' },
  { key: 'gesture', label: '' },
];

/** Ce qui manque au bon pour entrer dans une facture. */
const MISSING: Readonly<Record<UnconfirmedDeliveryView['fulfillmentMethod'], string>> = {
  pickup: 'Retrait non constaté',
  delivery: 'Livraison non constatée',
};

/**
 * **Les bons à constater de la période** (lot ZL ; dans l'onglet « Factures »
 * de la procédure depuis le 2026-10-24) : un bon au compte n'entre dans une
 * facture qu'une fois sa remise attestée — au comptoir ou à la porte. Ceux
 * dont le jour est passé sans remise ne sont ni facturés ni prélevés. La
 * liste vient du serveur, bornée à la période de la procédure ; le geste de
 * sortie est sur la commande : enregistrer le retrait ou la livraison, ou
 * l'annuler. Rien n'est rendu quand il n'y en a pas.
 */
@Component({
  selector: 'app-unconfirmed-deliveries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './unconfirmed-deliveries.html',
})
export class UnconfirmedDeliveries {
  readonly orders = input.required<readonly UnconfirmedDeliveryView[]>();

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: UnconfirmedDeliveryView): string => row.orderId;
  protected readonly day = day;
  protected readonly euros = euros;
  protected readonly missing = (mode: UnconfirmedDeliveryView['fulfillmentMethod']): string =>
    MISSING[mode];
}
