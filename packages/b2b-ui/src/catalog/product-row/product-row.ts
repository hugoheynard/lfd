import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { FoldButtonComponent, FoldNumberInputComponent, FoldToggleIconComponent } from 'fold-ng';

import type { CatalogOrder, CatalogProduct } from '../catalog-product.model';

/**
 * `lfd-product-row` — **rangée order-pad compacte**, pensée pour le réappro
 * dense : vignette + nom (+ puce panier), puis prix, option unité/colis,
 * pas-à-pas et « + ». Densité, pas flânerie.
 *
 * Partagée entre les deux fronts depuis le 2026-08-15 : le client s'en sert pour
 * son catalogue, le back-office pour saisir une commande au téléphone. C'est le
 * **deuxième usage réel** qui a justifié l'extraction — le back-office avait
 * commencé par la réécrire à la main, en moins bien (ni colisage, ni favori).
 *
 * **Générique** sur le produit : l'action remonte l'objet reçu avec son type
 * d'origine, pour que le client récupère son `FoldProduct` complet et non une
 * version amputée de ce qu'il a fourni.
 *
 * Présentationnelle de bout en bout : prix pré-formatés, favoris et panier
 * fournis par l'hôte. Elle ne connaît ni service ni source de données.
 */
@Component({
  selector: 'lfd-product-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldToggleIconComponent, FoldButtonComponent, FoldNumberInputComponent],
  templateUrl: './product-row.html',
  styleUrl: './product-row.scss',
})
export class ProductRow<T extends CatalogProduct = CatalogProduct> {
  readonly product = input.required<T>();
  readonly favorite = input(false);
  readonly inCart = input(0);
  readonly priceSuffix = input('');
  readonly notifyLabel = input('Me prévenir');
  /**
   * Le favori a-t-il un sens ici ? Faux ⇒ le cœur disparaît. Le back-office n'a
   * pas de favoris : lui montrer un bouton inerte inviterait à cliquer dessus.
   */
  readonly favoritable = input(true);

  readonly action = output<CatalogOrder<T>>();
  readonly favoriteToggle = output<T>();
  readonly notify = output<T>();

  readonly isOut = computed(() => this.product().outOfStock === true);
  readonly initial = computed(() => this.product().name.charAt(0).toUpperCase());

  readonly packSize = computed(() => this.product().step ?? 1);
  readonly hasPack = computed(() => this.packSize() > 1);

  readonly byPack = linkedSignal<T, boolean>({
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
