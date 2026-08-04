import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FoldCardComponent } from 'fold-ng';

/** Ce qu'un mode (emporter / sur place) hérite : les boutiques + le régime TVA. */
export interface ModeInheritance {
  readonly boutiques: readonly string[];
  readonly tva: string;
}

export interface CategoryInheritanceView {
  readonly categoryName: string;
  readonly emporter: ModeInheritance;
  readonly surPlace: ModeInheritance;
}

/** Panneau Canaux & TVA — **lecture seule**. Rend explicite l'héritage par
 *  famille : chaque mode montre ses boutiques et son régime de TVA. L'override
 *  par produit relève du futur contexte commerce. */
@Component({
  selector: 'app-channels-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent],
  templateUrl: './channels-panel.html',
  styleUrl: './panel.scss',
})
export class ChannelsPanel {
  readonly inheritance = input<CategoryInheritanceView | null>(null);
}
