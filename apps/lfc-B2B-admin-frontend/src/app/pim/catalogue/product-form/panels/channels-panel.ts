import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ProductFormStore, type RateView } from '../product-form-store';

/** Une ligne de l'encadré : un canal, ce qu'il dessert, et son taux. */
interface InheritedRow {
  readonly label: string;
  readonly boutiques: readonly string[];
  readonly sold: boolean;
  readonly rate: RateView | null;
}

/**
 * Panneau Canaux & TVA — **lecture seule**. Rend explicite l'héritage par
 * famille (canaux desservis + taux de TVA). L'override par produit relève du
 * futur contexte commerce.
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
   * Les canaux dans l'ordre où on les lit — **B2B d'abord** : c'est le métier de
   * cette app, et le mode boutique est le cas particulier, pas l'inverse.
   *
   * Une liste plutôt que trois blocs jumeaux dans le gabarit : le rendu d'un
   * taux était écrit trois fois, et une ligne oubliée dans une des copies ne se
   * serait vue nulle part.
   */
  protected readonly rows = computed<readonly InheritedRow[]>(() => {
    const inh = this.store.channelsInheritance();
    if (inh === null) {
      return [];
    }
    return [
      // Le B2B ne dessert pas de boutiques : il se vend depuis la plateforme.
      { label: 'B2B', boutiques: [], sold: inh.b2b.sold, rate: inh.b2b.rate },
      {
        label: 'À emporter',
        boutiques: inh.emporter.boutiques,
        sold: inh.emporter.sold,
        rate: inh.emporter.rate,
      },
      {
        label: 'Sur place',
        boutiques: inh.surPlace.boutiques,
        sold: inh.surPlace.sold,
        rate: inh.surPlace.rate,
      },
    ];
  });
}
