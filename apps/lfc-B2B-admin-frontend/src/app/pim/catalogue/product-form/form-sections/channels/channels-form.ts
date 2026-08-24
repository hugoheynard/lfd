import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldButtonIconComponent, FoldPanelHostService } from 'fold-ng';

import { formatPercent } from '../../../../data/channels';
import { ProductFormStore, type ChannelInheritance } from '../../product-form-store';
import { LocationStore } from '../../../../locations/location-store';
import {
  ChannelsOverridePanel,
  type ChannelsOverridePanelData,
  type ChannelsOverridePanelResult,
} from './channels-override-panel/channels-override-panel';
import {
  VatOverridePanel,
  type VatOverridePanelData,
  type VatOverridePanelResult,
} from './vat-override-panel/vat-override-panel';

/**
 * Panneau Canaux & TVA — **lecture seule**. Rend explicite l'héritage par
 * famille (canaux desservis + taux de TVA). L'override par produit relève du
 * futur contexte commerce.
 *
 * Les lignes viennent du magasin, qui les tient du registre : cet écran ne
 * connaît plus « à emporter / sur place / B2B ».
 */
@Component({
  selector: 'app-channels-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonIconComponent],
  templateUrl: './channels-form.html',
  styleUrls: ['../form-section.scss', './channels-form.scss'],
})
export class ChannelsForm {
  protected readonly store = inject(ProductFormStore);

  /**
   * Les lignes à rendre — celles du magasin, ou aucune quand aucune famille
   * n'est choisie. La vue n'a rien à composer : l'ordre et le contenu sont
   * décidés là où le registre est connu.
   */
  protected readonly rows = computed<readonly ChannelInheritance[]>(
    () => this.store.channelsInheritance()?.channels ?? [],
  );

  private readonly panelHost = inject(FoldPanelHostService);

  /**
   * Ouvre la dérogation de CETTE ligne.
   *
   * Le panneau ne connaît ni la fiche ni le magasin : il rend un choix, et
   * c'est ici qu'on en fait une écriture. La section « Tarif & TVA » l'enverra
   * avec le prix — les deux sont la même décision.
   */
  protected async redefine(row: ChannelInheritance): Promise<void> {
    const data: VatOverridePanelData = {
      contextKey: row.key,
      contextLabel: row.label,
      rates: this.store.rates(),
      inheritedLabel: this.inheritedLabel(row.key),
      current: this.store.vatOverride()[row.key] ?? null,
    };
    const chosen = await this.panelHost.open<VatOverridePanelData, VatOverridePanelResult>(
      VatOverridePanel,
      { data },
    ).closed;
    if (chosen !== undefined) {
      this.store.setVatOverride(row.key, chosen.rateId);
    }
  }

  private readonly locationStore = inject(LocationStore);

  /**
   * Ouvre la matrice de la fiche.
   *
   * Un seul geste pour toute la matrice, là où les taux se redéfinissent ligne
   * par ligne : une matrice à moitié redéfinie ne se lit pas, alors que deux
   * taux sont deux faits indépendants.
   */
  protected async redefineChannels(): Promise<void> {
    const data: ChannelsOverridePanelData = {
      current: this.store.channelsOverride(),
      inherited: this.store.familyChannels(),
      locations: this.locationStore.items(),
      unreadable: this.locationStore.loadError(),
    };
    const chosen = await this.panelHost.open<
      ChannelsOverridePanelData,
      ChannelsOverridePanelResult
    >(ChannelsOverridePanel, { data }).closed;
    if (chosen !== undefined) {
      this.store.channelsOverride.set(chosen.channels);
    }
  }

  /** Le taux de la FAMILLE pour ce contexte, nommé — jamais celui de la fiche. */
  private inheritedLabel(contextKey: string): string {
    const rateId = this.store.familyVat()[contextKey];
    const rate = rateId === undefined ? undefined : this.store.rates().find((r) => r.id === rateId);
    return rate === undefined ? 'non réglé' : `${rate.name} · ${formatPercent(rate.percent)}`;
  }
}
