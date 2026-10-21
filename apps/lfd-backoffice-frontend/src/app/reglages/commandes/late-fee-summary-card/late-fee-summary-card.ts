import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderLateFeeView } from '@lfd/contracts';
import { formatAdjustmentValue } from '@lfd/b2b-ui/pricing';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderLateFeeService } from '../../../comptabilite/order-late-fee/order-late-fee.service';

type LoadState = 'forbidden' | 'loading' | 'ready' | 'error';

/** « 5,5 % » — le séparateur français, comme l'écran de Comptabilité. */
function percentLabel(percent: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(percent)} %`;
}

/**
 * **La surtaxe de retard, EN LECTURE** sur la page de l'heure limite — ce
 * qu'une dérogation coûte, à côté du rattrapage qu'elle ouvre (Hugo,
 * 2026-10-21 : « la surtaxe en lecture seule » ; point 2 de
 * `limites-de-commande/schema-des-reglages.md`).
 *
 * Elle se RÈGLE toujours en Comptabilité, sous `b2b_late_fee` : ce montant est
 * une pénalité facturée, et son droit n'est pas celui des réglages de commande.
 * La carte garde ce droit : sans `b2b_late_fee:read`, elle le dit et ne lit
 * rien (le serveur refuserait) ; avec `b2b_late_fee:write`, elle renvoie à
 * l'écran qui la règle.
 */
@Component({
  selector: 'app-late-fee-summary-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    RouterLink,
  ],
  templateUrl: './late-fee-summary-card.html',
  styleUrl: './late-fee-summary-card.scss',
})
export class LateFeeSummaryCard {
  private readonly api = inject(OrderLateFeeService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canEdit = computed(() => this.permissions.can('b2b_late_fee:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly setting = signal<OrderLateFeeView>(null);

  /** Le montant en clair : « 15,00 € HT » ou « 10 % du sous-total ». */
  protected readonly amount = computed(() => {
    const fee = this.setting()?.fee ?? null;
    if (fee === null) {
      return null;
    }
    return fee.mode === 'amount'
      ? `${formatAdjustmentValue(fee)} HT`
      : `${formatAdjustmentValue(fee)} du sous-total`;
  });

  protected readonly vatRate = computed(() => {
    const percent = this.setting()?.vatRatePercent ?? null;
    return percent === null ? null : percentLabel(percent);
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (!this.permissions.can('b2b_late_fee:read')) {
      this.state.set('forbidden');
      return;
    }
    this.state.set('loading');
    try {
      this.setting.set(await this.api.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
