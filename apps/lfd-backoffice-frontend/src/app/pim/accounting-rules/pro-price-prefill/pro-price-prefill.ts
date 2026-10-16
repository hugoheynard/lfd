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

/**
 * La vraie cause d'une alignée qui restera sans prix pro (lot S) : son défaut
 * ne peut pas être pré-rempli, et la phrase dit pourquoi.
 */
const ALIGNED_CAUSE_LABELS: Readonly<Record<'no_price' | 'no_vat_b2b', string>> = {
  no_price: 'sans prix public',
  no_vat_b2b: 'sans taux B2B',
};

/** Une ligne affichée — les montants déjà mis en forme. */
export interface PrefillRow {
  readonly key: string;
  readonly product: string;
  readonly sku: string;
  /**
   * Le sort, en mots. Une alignée se dit sous son défaut, avec la vraie cause
   * quand le défaut ne recevra pas de prix pro : « suit PAT-7-1 — sans taux
   * B2B ».
   */
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

function statusLabel(row: ProPricePrefillRowView): string {
  if (row.status !== 'aligned' || row.followsSku === null) {
    return PREFILL_STATUS_LABELS[row.status];
  }
  const follows = `suit ${row.followsSku}`;
  return row.alignedCause === null
    ? follows
    : `${follows} — ${ALIGNED_CAUSE_LABELS[row.alignedCause]}`;
}

/**
 * L'ordre de l'aperçu : chaque alignée SOUS le défaut qu'elle suit, les autres
 * dans l'ordre du serveur.
 */
export function groupedUnderDefaults(
  rows: readonly ProPricePrefillRowView[],
): ProPricePrefillRowView[] {
  const followers = (row: ProPricePrefillRowView) =>
    rows.filter(
      (other) =>
        other.status === 'aligned' &&
        other.productId === row.productId &&
        other.followsSku === row.sku,
    );
  const placed = new Set<string>();
  const ordered: ProPricePrefillRowView[] = [];
  for (const row of rows) {
    if (placed.has(row.variantId) || (row.status === 'aligned' && row.followsSku !== null)) {
      continue;
    }
    for (const entry of [row, ...followers(row)]) {
      placed.add(entry.variantId);
      ordered.push(entry);
    }
  }
  // Une alignée dont le défaut n'est pas dans la liste n'est jamais perdue.
  return [...ordered, ...rows.filter((row) => !placed.has(row.variantId))];
}

function toRow(row: ProPricePrefillRowView): PrefillRow {
  return {
    key: row.variantId,
    product: row.productName,
    sku: row.sku,
    status: statusLabel(row),
    publicTtc: row.publicTtcCents === null ? '—' : formatCents(row.publicTtcCents),
    served: htLabel(row.servedHtMillicents),
    prefilled: htLabel(row.prefilledHtMillicents),
    mismatch: row.mismatch,
  };
}

/**
 * **Pré-remplir le prix pro HT depuis le rapport suggéré** (lot P, P5 ; lot S
 * de `plan-catalogue-synchronise-par-audience.md`) — en deux temps.
 *
 * L'aperçu dit **deux vérités** selon la méthode en place :
 *
 * - sous `ratio_ttc`, « rien de servi ne change » : par déclinaison, le HT que
 *   le fil sert AUJOURD'HUI et celui que l'écriture poserait ; au moindre
 *   écart, le bouton s'éteint et un encadré le dit ;
 * - sous `entered`, « ces déclinaisons deviendront vendables aux pros à ce
 *   prix » : rien n'est servi aujourd'hui, et l'écriture se CONFIRME.
 *
 * Dans les deux cas il dit la phrase du vrai basculement : une fois écrit, le
 * prix public ne bouge plus le prix pro. Les alignées sont rangées sous leur
 * défaut, avec la vraie cause quand il ne sera pas pré-rempli.
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

  protected readonly rows = computed(() =>
    groupedUnderDefaults(this.preview()?.rows ?? []).map(toRow),
  );

  /** Sous « prix saisi », l'écriture met en vente : elle se confirme d'abord. */
  protected readonly confirming = signal(false);

  protected readonly entered = computed(() => this.preview()?.method === 'entered');

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

  /** Sous `entered`, le premier clic demande confirmation ; le second écrit. */
  protected async apply(): Promise<void> {
    if (this.entered() && !this.confirming()) {
      this.confirming.set(true);
      return;
    }
    const count = this.preview()?.toPrefill ?? 0;
    this.busy.set(true);
    try {
      await this.store.apply();
      this.notify.success(`${String(count)} prix pro pré-rempli(s).`);
    } catch (caught) {
      this.notify.refused(caught, 'Pré-remplissage refusé.');
    } finally {
      this.confirming.set(false);
      this.busy.set(false);
    }
  }

  protected cancel(): void {
    this.confirming.set(false);
  }
}
