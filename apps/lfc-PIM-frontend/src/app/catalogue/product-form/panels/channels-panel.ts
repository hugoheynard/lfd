import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FoldCardComponent } from 'fold-ng';

export interface CategoryTvaView {
  readonly emporter: string;
  readonly surPlace: string;
}

/** Panneau Canaux & TVA — **lecture seule**. Affiche la TVA héritée de la
 *  famille ; l'override par produit relève du futur contexte commerce. */
@Component({
  selector: 'app-channels-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent],
  templateUrl: './channels-panel.html',
  styleUrl: './panel.scss',
})
export class ChannelsPanel {
  readonly tva = input<CategoryTvaView | null>(null);
}
