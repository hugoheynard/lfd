import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PurchaseTableView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { priceLabel } from '../purchase-price';
import {
  type GridCell,
  type GridRow,
  gridRows,
  type PurchaseTableCriterion,
} from '../purchase-table';

/**
 * **La grille du tableau croisé** (`plan-bibliotheque-d-achat.md`, B-D4, lot
 * B5) : une ligne par véhicule, une colonne par format ; par case, les bacs,
 * le taux d'occupation, le volume utile et les coûts HT.
 *
 * La case mise en avant est celle que le SERVEUR désigne (`row.best`) pour le
 * critère choisi : l'écran ne reclasse rien. Le coût par litre ne s'affiche
 * que sur demande (Q3), et la meilleure ligne avec lui, qui en dépend.
 */
@Component({
  selector: 'app-purchase-table-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    NgTemplateOutlet,
  ],
  templateUrl: './purchase-table-grid.html',
  styleUrl: './purchase-table-grid.scss',
})
export class PurchaseTableGrid {
  readonly view = input.required<PurchaseTableView>();
  readonly criterion = input.required<PurchaseTableCriterion>();
  readonly showCostPerLiter = input(false);

  protected readonly rows = computed(() =>
    gridRows(this.view(), this.criterion(), this.showCostPerLiter()),
  );

  protected readonly columns = computed<readonly FoldTableColumn<GridRow>[]>(() => [
    { key: 'vehicle', label: 'Véhicule' },
    ...this.view().formats.map((format, index) => ({
      key: `format-${String(index)}`,
      label: `${format.name} · ${String(format.innerVolumeLiters)} L · ${priceLabel(format.unitPriceCentsExclVat)}`,
    })),
  ]);

  protected readonly rowKey = (row: GridRow): string => row.key;

  /** Le gabarit ne connaît pas le type de sa ligne : on le rend ici. */
  protected cellAt(row: GridRow, index: number): GridCell | undefined {
    return row.cells[index];
  }

  protected asRow(row: GridRow): GridRow {
    return row;
  }
}
