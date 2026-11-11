import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldTableTone,
} from 'fold-ng';
import { formatEuros } from '@lfd/catalog-ui';

import type { AmendmentRow } from '../amendment-rows';
import { FirmPriceField } from '../firm-price-field/firm-price-field';
import { TarifFilterBar } from '../tarif-filter-bar/tarif-filter-bar';
import { ALL_SHELVES, normalizeSearch } from '../tarif-filter';

/** Un prix saisi dans la table. */
export interface FirmPriceEdit {
  readonly sku: string;
  readonly euros: number | null;
}

/**
 * **La table de l'avenant** (étape 1) : peu de colonnes — l'article, ce qu'il
 * paie, ce qu'il paierait, le prix ferme à saisir, et l'étiquette du
 * changement. La famille, le prix de base et la limite vont en ligne
 * secondaire sous l'article. Une ligne changée est surlignée (ton de ligne
 * fold), son ancien prix barré et lu « avant : … ».
 *
 * Une ligne à paliers ne se réécrit pas : on peut la retirer, puis reposer un
 * prix fixe.
 */
@Component({
  selector: 'app-amendment-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FirmPriceField,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    TarifFilterBar,
  ],
  templateUrl: './amendment-table.html',
  styleUrl: './amendment-table.scss',
})
export class AmendmentTable {
  readonly rows = input.required<readonly AmendmentRow[]>();
  readonly shelfOptions = input.required<readonly { value: string; label: string }[]>();
  /** « Aujourd'hui », ou « Au 01/12/2026 » pour une date d'effet future. */
  readonly beforeLabel = input.required<string>();
  /** « Voir seulement les changements » — réglé aussi depuis la barre du bas. */
  readonly onlyChanged = model.required<boolean>();

  readonly priceChange = output<FirmPriceEdit>();
  /** Retirer (`true`) ou garder (`false`) une ligne à paliers. */
  readonly tieredChange = output<{ readonly sku: string; readonly removed: boolean }>();

  protected readonly euros = formatEuros;
  protected readonly shelf = signal<string>(ALL_SHELVES);
  protected readonly search = signal('');

  protected readonly visible = computed(() => {
    const needle = normalizeSearch(this.search());
    return this.rows().filter(
      (row) =>
        (this.shelf() === ALL_SHELVES || row.shelfId === this.shelf()) &&
        (!this.onlyChanged() || row.label?.changed === true) &&
        (needle === '' ||
          normalizeSearch(row.name).includes(needle) ||
          normalizeSearch(row.sku).includes(needle)),
    );
  });

  protected readonly columns = computed((): readonly FoldTableColumn<AmendmentRow>[] => [
    { key: 'article', label: 'Article' },
    { key: 'before', label: this.beforeLabel(), width: '9rem', numeric: true },
    { key: 'after', label: 'Après l’avenant', width: '11rem', numeric: true },
    { key: 'price', label: 'Prix ferme', width: '12rem' },
    { key: 'change', label: 'Changement', width: '10rem' },
  ]);

  protected readonly empty: FoldTableEmpty = {
    title: 'Aucun article ne correspond',
    subtitle: 'Changez de famille, effacez la recherche ou affichez tous les articles.',
  };

  protected readonly rowKey = (row: AmendmentRow): string => row.sku;

  /** Le surlignage d'une ligne changée ; l'étiquette le dit aussi en toutes lettres. */
  protected readonly rowTone = (row: AmendmentRow): FoldTableTone =>
    row.label?.changed === true ? 'warning' : null;
}
