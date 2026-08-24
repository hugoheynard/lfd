import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ProductFormStore, type ChannelInheritance } from '../product-form-store';

/**
 * Panneau Canaux & TVA — **lecture seule**. Rend explicite l'héritage par
 * famille (canaux desservis + taux de TVA). L'override par produit relève du
 * futur contexte commerce.
 *
 * Les lignes viennent du magasin, qui les tient du registre : cet écran ne
 * connaît plus « à emporter / sur place / B2B ».
 */
@Component({
  selector: 'app-channels-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './channels-panel.html',
  styleUrl: './panel.scss',
})
export class ChannelsPanel {
  protected readonly store = inject(ProductFormStore);

  /**
   * Les lignes à rendre — celles du magasin, ou aucune quand aucune famille
   * n'est choisie. La vue n'a rien à composer : l'ordre et le contenu sont
   * décidés là où le registre est connu.
   */
  protected readonly rows = computed<readonly ChannelInheritance[]>(
    () => this.store.channelsInheritance()?.channels ?? [],
  );
}
