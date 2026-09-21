import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FoldElementTitleComponent, FoldListboxComponent, FoldOptionComponent } from 'fold-ng';

import { formatPercent } from '../../../../data/channels';
import { PointOfSaleStore } from '../../../../points-of-sale/point-of-sale-store';
import { ChannelMatrix } from '../../../channel-matrix/channel-matrix';
import type { VatRate } from '../../../catalogue-api';
import { VatRateStore } from '../../../vat-rates/vat-store';
import { CategoryFormStore } from '../../category-form-store';

/**
 * Canaux par défaut et taux de TVA — **une seule section**, parce que les deux
 * ne se règlent pas séparément : un taux ne se pose que sur un canal vendu, et
 * fermer un canal efface le sien. Les séparer en deux cartes enregistrables
 * ferait un ordre d'écriture visible à l'utilisateur, et lui laisserait la
 * possibilité d'enregistrer la moitié qui casse l'autre.
 */
@Component({
  selector: 'app-category-channels-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    ChannelMatrix,
  ],
  templateUrl: './channels-form.html',
  styleUrls: ['../../../product-form/form-sections/form-section.scss'],
})
export class CategoryChannelsForm {
  protected readonly store = inject(CategoryFormStore);
  private readonly points = inject(PointOfSaleStore);
  private readonly vatRates = inject(VatRateStore);

  protected readonly pointsOfSale = computed(() => this.points.items());
  protected readonly pointsOfSaleError = computed(() => this.points.loadError());
  protected readonly rates = computed(() => this.vatRates.items());

  /** Aucun canal coché ⇒ la partie « taux » n'a rien à montrer. */
  protected readonly hasAnyChannel = computed(() => this.store.settableContexts().length > 0);

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
