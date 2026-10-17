import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldButtonIconComponent, FoldPanelHostService } from 'fold-ng';

import { formatPercent } from '../../../../data/channels';
import { ProductFormStore, type ChannelInheritance } from '../../product-form-store';
import {
  VatOverridePanel,
  type VatOverridePanelData,
  type VatOverridePanelResult,
} from './vat-override-panel/vat-override-panel';

/**
 * Panneau TVA par contexte — rend explicite l'héritage par famille et la
 * dérogation de la fiche, ligne par ligne. Les canaux desservis (la matrice,
 * et sa redéfinition par fiche) sont partis en X4
 * (`documentation/catalogue/plan-sans-interrupteurs.md`) ; les contextes de
 * vente et leur TVA restent.
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

  /** Le taux de la FAMILLE pour ce contexte, nommé — jamais celui de la fiche. */
  private inheritedLabel(contextKey: string): string {
    const rateId = this.store.familyVat()[contextKey];
    const rate = rateId === undefined ? undefined : this.store.rates().find((r) => r.id === rateId);
    return rate === undefined ? 'non réglé' : `${rate.name} · ${formatPercent(rate.percent)}`;
  }
}
