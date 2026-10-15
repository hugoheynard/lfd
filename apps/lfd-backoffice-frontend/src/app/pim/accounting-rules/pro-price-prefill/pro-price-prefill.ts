import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ProPricePrefillRowView, ProPricePrefillStatus } from '@lfd/pim-contracts';
import { formatCents } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { proPriceTextOf } from '../../catalogue/product-form/pro-price-entry';
import { ProPricePrefillStore } from '../pro-price-prefill.store';

/** Le sort d'une déclinaison, dans les mots de l'écran. */
export const PREFILL_STATUS_LABELS: Readonly<Record<ProPricePrefillStatus, string>> = {
  to_prefill: 'à pré-remplir',
  already_entered: 'déjà saisi',
  aligned: 'suit le défaut',
  no_price: 'sans prix public',
  no_vat_b2b: 'sans taux B2B',
};

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'article', label: 'Déclinaison' },
  { key: 'status', label: 'Sort', width: '9rem' },
  { key: 'public', label: 'Public TTC', numeric: true, width: '7rem' },
  { key: 'served', label: 'HT servi', numeric: true, width: '8rem' },
  { key: 'prefilled', label: 'HT pré-rempli', numeric: true, width: '8rem' },
];

/** Une ligne affichée — les montants déjà mis en forme. */
export interface PrefillRow {
  readonly key: string;
  readonly product: string;
  readonly sku: string;
  readonly status: string;
  readonly publicTtc: string;
  readonly served: string;
  readonly prefilled: string;
  readonly mismatch: boolean;
}

/** Cinq décimales, en euros : « 24 € », « 8,53081 € ». */
function htLabel(millicents: number | null): string {
  return millicents === null ? '—' : `${proPriceTextOf(millicents)} €`;
}

function toRow(row: ProPricePrefillRowView): PrefillRow {
  return {
    key: row.variantId,
    product: row.productName,
    sku: row.sku,
    status: PREFILL_STATUS_LABELS[row.status],
    publicTtc: row.publicTtcCents === null ? '—' : formatCents(row.publicTtcCents),
    served: htLabel(row.servedHtMillicents),
    prefilled: htLabel(row.prefilledHtMillicents),
    mismatch: row.mismatch,
  };
}

/**
 * **Pré-remplir le prix pro HT depuis la remise** (lot P, P5 de
 * `plan-catalogue-synchronise-par-audience.md`) — en deux temps.
 *
 * L'aperçu montre, par déclinaison, le HT que le fil sert AUJOURD'HUI et celui
 * que l'écriture poserait ; au moindre écart, le bouton s'éteint et un encadré
 * le dit. L'écriture ne touche que les déclinaisons à tarif propre et sans
 * saisie. Basculer la méthode sur « Prix saisi » reste un geste à part.
 */
@Component({
  selector: 'app-pro-price-prefill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
  ],
  templateUrl: './pro-price-prefill.html',
  styleUrl: './pro-price-prefill.scss',
})
export class ProPricePrefill {
  private readonly store = inject(ProPricePrefillStore);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  /** Pré-remplir écrit des fiches : le droit comptable d'écriture, comme la méthode. */
  protected readonly canWrite = computed(() => this.permissions.can('pim_tax:write'));

  protected readonly busy = signal(false);
  protected readonly preview = this.store.preview;
  protected readonly loadError = this.store.loadError;
  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: PrefillRow): string => row.key;
  protected readonly rowTone = (row: PrefillRow): 'alert' | null => (row.mismatch ? 'alert' : null);

  protected readonly rows = computed(() => this.preview()?.rows.map(toRow) ?? []);

  protected readonly canApply = computed(() => {
    const view = this.preview();
    return (
      this.canWrite() &&
      !this.busy() &&
      view !== null &&
      view.toPrefill > 0 &&
      view.mismatches === 0
    );
  });

  protected async load(): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.load();
    } catch {
      // L'échec est retenu dans `loadError`, que l'encadré lit.
    } finally {
      this.busy.set(false);
    }
  }

  protected async apply(): Promise<void> {
    const count = this.preview()?.toPrefill ?? 0;
    this.busy.set(true);
    try {
      await this.store.apply();
      this.notify.success(`${String(count)} prix pro pré-rempli(s).`);
    } catch (caught) {
      this.notify.refused(caught, 'Pré-remplissage refusé.');
    } finally {
      this.busy.set(false);
    }
  }
}
