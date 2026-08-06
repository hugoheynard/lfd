import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { FoldButtonComponent, FoldNumberInputComponent, FoldToggleIconComponent } from 'fold-ng';

import type { FoldProduct, FoldProductOrder } from '../fold-product-card/fold-product.model';

/**
 * `app-product-row` — **rangée order-pad compacte** (app-owned), pensée pour le
 * **réappro** dense : vignette + nom (+ puce panier), puis prix + option unité/colis
 * + pas-à-pas + « + ». Densité, pas flânerie — la carte large (`app-product-card`)
 * reste pour la découverte. Même contrat, prix pré-formatés.
 */
@Component({
  selector: 'app-product-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldToggleIconComponent, FoldButtonComponent, FoldNumberInputComponent],
  templateUrl: './product-row.html',
  styleUrl: './product-row.scss',
})
export class ProductRowComponent {
  readonly product = input.required<FoldProduct>();
  readonly favorite = input(false);
  readonly inCart = input(0);
  readonly priceSuffix = input('');
  readonly notifyLabel = input('Me prévenir');

  readonly action = output<FoldProductOrder>();
  readonly favoriteToggle = output<FoldProduct>();
  readonly notify = output<FoldProduct>();

  readonly isOut = computed(() => this.product().outOfStock === true);
  readonly initial = computed(() => this.product().name.charAt(0).toUpperCase());

  readonly packSize = computed(() => this.product().step ?? 1);
  readonly hasPack = computed(() => this.packSize() > 1);

  readonly byPack = linkedSignal<FoldProduct, boolean>({
    source: this.product,
    computation: () => (this.product().step ?? 1) > 1,
  });

  readonly step = computed(() => (this.byPack() ? this.packSize() : 1));
  readonly minQty = computed(() => this.step());
  readonly packOptionLabel = computed(() => this.product().packLabel ?? `× ${this.packSize()}`);
  readonly quantity = linkedSignal(() => this.minQty());
  readonly addText = computed(() => `Ajouter ${this.quantity()}`);

  onAction(): void {
    this.action.emit({ product: this.product(), quantity: this.quantity() });
  }

  onFavorite(): void {
    this.favoriteToggle.emit(this.product());
  }

  onNotify(): void {
    this.notify.emit(this.product());
  }
}
