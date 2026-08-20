import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FoldCardComponent } from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

/** Panneau Canaux & TVA — **lecture seule**. Rend explicite l'héritage par
 *  famille (boutiques + régime de TVA par mode). L'override par produit relève
 *  du futur contexte commerce. */
@Component({
  selector: 'app-channels-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent],
  templateUrl: './channels-panel.html',
  styleUrl: './panel.scss',
})
export class ChannelsPanel {
  protected readonly store = inject(ProductFormStore);
}
