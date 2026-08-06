import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldNumberInputComponent,
  FoldToggleIconComponent,
} from 'fold-ng';

import type { FoldProduct, FoldProductOrder } from '../fold-product-card/fold-product.model';

/**
 * `app-product-card` — **notre** carte produit (app-owned), libre d'évoluer dans ce
 * repo (à la différence de `fold-product-card`, écrite pour migrer telle quelle dans
 * `fold-ng`). Même contrat d'entrées/sorties, **mise en page différente** :
 *
 * - **row du nom** : nom + puce « N au panier » (`space-between`) ;
 * - **row du prix** : prix + sélecteur d'unité (à l'unité / par colis) `space-between` ;
 * - **row de commande** : pas-à-pas de quantité + « Ajouter N ».
 *
 * Le reste (média à ratio fixe, ruban rupture/bientôt, favori, sous-total ligne)
 * suit la carte fold. Présentationnel : les prix arrivent pré-formatés.
 */
@Component({
  selector: 'app-product-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldToggleIconComponent,
    FoldButtonComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
})
export class ProductCardComponent {
  readonly product = input.required<FoldProduct>();
  readonly favorite = input(false);
  /** Combien déjà au panier (piloté par le parent). `0` masque la puce. */
  readonly inCart = input(0);
  readonly addLabel = input('Ajouter');
  readonly priceSuffix = input('');
  readonly priceFormat = input<((value: number) => string) | null>(null);
  readonly highlight = input(false, { transform: booleanAttribute });
  readonly outOfStockLabel = input('Rupture de stock');
  readonly notifyLabel = input('Me prévenir');

  readonly action = output<FoldProductOrder>();
  readonly favoriteToggle = output<FoldProduct>();
  readonly notify = output<FoldProduct>();

  readonly isOut = computed(() => this.product().outOfStock === true);

  readonly warnDays = computed<number | null>(() => {
    const d = this.product().daysLeft;
    if (this.isOut() || d === undefined || d <= 0) {
      return null;
    }
    return d;
  });

  readonly initial = computed(() => this.product().name.charAt(0).toUpperCase());

  /** Taille de colis (colisage / PCB) ; `1` = pas de colis. */
  readonly packSize = computed(() => this.product().step ?? 1);
  readonly hasPack = computed(() => this.packSize() > 1);

  /** Mode de commande — par colis (multiples de `packSize`) ou à l'unité. Par colis
   *  par défaut s'il en existe un ; réinitialisé au changement de produit. */
  readonly byPack = linkedSignal<FoldProduct, boolean>({
    source: this.product,
    computation: () => (this.product().step ?? 1) > 1,
  });

  readonly step = computed(() => (this.byPack() ? this.packSize() : 1));
  readonly minQty = computed(() => this.step());
  readonly packOptionLabel = computed(() => this.product().packLabel ?? `Par ${this.packSize()}`);

  /** Quantité à ajouter — retombe au minimum au changement de produit OU de mode. */
  readonly quantity = linkedSignal(() => this.minQty());

  readonly addText = computed(() => `${this.addLabel()} ${this.quantity()}`);

  readonly lineSubtotal = computed<string | null>(() => {
    const value = this.product().priceValue;
    const format = this.priceFormat();
    if (value === undefined || format === null) {
      return null;
    }
    return format(value * this.quantity());
  });

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
