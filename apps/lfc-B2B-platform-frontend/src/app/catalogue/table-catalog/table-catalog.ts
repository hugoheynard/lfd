import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { FoldProduct, FoldProductOrder } from '../../../shared';
import { TableCatalogRow } from './table-catalog-row';

/**
 * Vue **order-pad** du catalogue — une table dense (réf · produit · cond. · prix
 * HT · quantité · ajouter), pensée pour la saisie rapide des acheteurs récurrents.
 * Vue « bête » pilotée par {@link ProductCatalogue} ; chaque ligne est un
 * {@link TableCatalogRow} qui porte sa propre quantité.
 */
@Component({
  selector: 'app-table-catalog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TableCatalogRow],
  templateUrl: './table-catalog.html',
  styleUrl: './table-catalog.scss',
})
export class TableCatalog {
  readonly products = input.required<readonly FoldProduct[]>();

  readonly add = output<FoldProductOrder>();
  readonly notify = output<FoldProduct>();
}
