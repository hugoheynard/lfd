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
import {
  floorQuantityOf,
  nextSaleQuantity,
  previousSaleQuantity,
  saleQuantityLabel,
  settleSaleQuantity,
} from '../sale-terms';

/**
 * `lfd-product-row` — **rangée order-pad compacte**, pensée pour le réappro
 * dense : vignette + nom, puis prix, option unité/colis,
 * pas-à-pas et « Ajouter » — ou, déjà au panier, le pas-à-pas de la ligne
 * elle-même (« − n + », le « − » devenant « retirer » au plancher). Densité, pas flânerie.
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

  /** Pas encore au panier : « Ajouter » avec la quantité réglée. */
  readonly action = output<CatalogOrder<T>>();
  /**
   * Déjà au panier : la quantité **absolue** que la ligne doit prendre, réglée
   * sur le plancher et le pas ; **0** = retirer la ligne.
   */
  readonly quantityChange = output<CatalogOrder<T>>();
  readonly favoriteToggle = output<T>();
  readonly notify = output<T>();

  readonly isOut = computed(() => this.product().outOfStock === true);
  readonly initial = computed(() => this.product().name.charAt(0).toUpperCase());

  /**
   * Vendu au poids (P5) : la quantité compte des grammes, `step` est le pas
   * de l'article — pas un colisage, donc aucun choix unité/colis.
   */
  readonly byWeight = computed(() => this.product().saleUnit === 'weight');

  readonly packSize = computed(() => this.product().step ?? 1);
  readonly hasPack = computed(() => !this.byWeight() && this.packSize() > 1);

  readonly byPack = linkedSignal<T, boolean>({
    source: this.product,
    computation: () => this.product().saleUnit !== 'weight' && (this.product().step ?? 1) > 1,
  });

  readonly step = computed(() => (this.byWeight() || this.byPack() ? this.packSize() : 1));
  /**
   * Le plancher : le premier multiple du pas qui atteint le minimum de
   * l'article (au poids, ou en pièces — plan quantité minimale, Q6), le pas
   * lui-même sans minimum.
   */
  readonly minQty = computed(() => floorQuantityOf(this.product().minimum, this.step()));
  readonly packOptionLabel = computed(() => this.product().packLabel ?? `× ${this.packSize()}`);
  readonly quantity = linkedSignal(() => this.minQty());
  readonly addText = computed(() => `Ajouter ${this.said(this.quantity())}`);

  /** Déjà au panier : la rangée édite la ligne au lieu d'en ajouter une. */
  readonly inCartMode = computed(() => this.inCart() > 0);
  /**
   * Le brouillon du champ en mode panier : suit le panier, et ne part qu'au
   * blur ou à Entrée — chaque frappe n'est pas une commande.
   */
  readonly cartDraft = linkedSignal<number | null>(() => this.inCart());
  /** Au plancher, le « − » retire la ligne plutôt que de la vider à moitié. */
  readonly atFloor = computed(() => this.inCart() <= this.minQty());
  readonly removeText = computed(() => `Retirer ${this.product().name}`);

  private said(quantity: number): string {
    return saleQuantityLabel(quantity, this.product().saleUnit);
  }

  onAction(): void {
    const quantity = settleSaleQuantity(this.quantity(), this.product().minimum, this.step());
    this.quantity.set(quantity);
    this.action.emit({ product: this.product(), quantity });
  }

  onIncrement(): void {
    this.emitQuantity(nextSaleQuantity(this.inCart(), this.product().minimum, this.step()));
  }

  onDecrement(): void {
    this.emitQuantity(previousSaleQuantity(this.inCart(), this.product().minimum, this.step()));
  }

  /** Saisie au clavier validée : ramenée à la règle, jamais envoyée telle quelle. */
  onCommitDraft(): void {
    const typed = this.cartDraft();
    const settled =
      typed === null
        ? this.inCart()
        : settleSaleQuantity(typed, this.product().minimum, this.step());
    this.cartDraft.set(settled);
    if (settled !== this.inCart()) {
      this.emitQuantity(settled);
    }
  }

  private emitQuantity(quantity: number): void {
    this.quantityChange.emit({ product: this.product(), quantity });
  }

  onFavorite(): void {
    this.favoriteToggle.emit(this.product());
  }

  onNotify(): void {
    this.notify.emit(this.product());
  }
}
