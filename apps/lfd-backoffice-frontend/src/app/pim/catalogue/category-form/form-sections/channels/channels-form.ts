import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FoldElementTitleComponent, FoldListboxComponent, FoldOptionComponent } from 'fold-ng';

import { formatPercent } from '../../../../data/channels';
import type { VatRate } from '../../../catalogue-api';
import { VatRateStore } from '../../../vat-rates/vat-store';
import { CategoryFormStore } from '../../category-form-store';

/**
 * Les taux de TVA de la famille, un par contexte de vente en service. La
 * section portait aussi la matrice des canaux (`ChannelMatrix`), partie en X4
 * (`documentation/catalogue/catalogue-synchronise.md` §6) : les contextes de
 * vente et leur TVA restent.
 */
@Component({
  selector: 'app-category-channels-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldElementTitleComponent, FoldListboxComponent, FoldOptionComponent],
  templateUrl: './channels-form.html',
  styleUrls: ['../../../product-form/form-sections/form-section.scss'],
})
export class CategoryChannelsForm {
  protected readonly store = inject(CategoryFormStore);
  private readonly vatRates = inject(VatRateStore);

  protected readonly rates = computed(() => this.vatRates.items());

  /** Aucun contexte en service ⇒ la partie « taux » n'a rien à montrer. */
  protected readonly hasAnyContext = computed(() => this.store.settableContexts().length > 0);

  protected vatOf(contextKey: string): string {
    return this.store.vat()[contextKey] ?? '';
  }

  protected setVatOf(contextKey: string, rateId: string): void {
    this.store.vat.update((current) => ({ ...current, [contextKey]: rateId }));
  }

  protected rateLabel(rate: VatRate): string {
    return `${rate.name} · ${formatPercent(rate.percent)}`;
  }
}
