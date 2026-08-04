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

import type { FoldProduct, FoldProductOrder } from './fold-product.model';

/**
 * `fold-product-card` — a product tile: a fixed-ratio visual (or an
 * initial-lettered placeholder), an optional corner badge, name + detail, a
 * price, and an optional action button. The media keeps a constant aspect ratio
 * (`--fold-product-card-ratio`) so a grid of cards stays even whatever the
 * source images.
 *
 * Authored to fold conventions so it can move into `fold-ng` unchanged.
 */
@Component({
  selector: 'fold-product-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldToggleIconComponent,
    FoldButtonComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './fold-product-card.html',
  styleUrl: './fold-product-card.scss',
})
export class FoldProductCardComponent {
  /** The product to render. */
  readonly product = input.required<FoldProduct>();

  /** Whether this product is currently favourited (controlled by the parent). */
  readonly favorite = input(false);

  /** How many of this product are already in the cart (parent-owned). Drives the
   *  "déjà N au panier" hint. `0` hides it. */
  readonly inCart = input(0);

  /** Base label of the add button; the card appends the chosen quantity
   *  ("Ajouter 10"). */
  readonly addLabel = input('Ajouter');

  /** A suffix rendered after the unit price (e.g. "HT" in a B2B catalogue). */
  readonly priceSuffix = input('');

  /** Optional numeric-price formatter — when set (and the product carries a
   *  numeric `priceValue`), the card shows a live line subtotal (price × qty).
   *  Kept an input so the card never guesses currency/locale. */
  readonly priceFormat = input<((value: number) => string) | null>(null);

  /**
   * Mise en avant : contour primary plus épais. Générique (le libellé « best
   * seller » et son tag restent à la charge du parent), pour rester réutilisable
   * dans fold-ng.
   */
  readonly highlight = input(false, { transform: booleanAttribute });

  /** Label of the out-of-stock ribbon. */
  readonly outOfStockLabel = input('Rupture de stock');
  /** Label of the notify button shown in place of the CTA when out of stock. */
  readonly notifyLabel = input('Me prévenir');

  /** Fired when the card's action is activated — carries the chosen quantity. */
  readonly action = output<FoldProductOrder>();

  /** Fired when the favourite heart is toggled — the parent owns the state. */
  readonly favoriteToggle = output<FoldProduct>();

  /** Fired when "notify me" is clicked on an out-of-stock product. */
  readonly notify = output<FoldProduct>();

  /** Out of stock — driven by the product's `outOfStock` flag. */
  readonly isOut = computed(() => this.product().outOfStock === true);

  /** Days left before running out (null when none / already out of stock). */
  readonly warnDays = computed<number | null>(() => {
    const d = this.product().daysLeft;
    if (this.isOut() || d === undefined || d <= 0) {
      return null;
    }
    return d;
  });

  /** Placeholder glyph when there is no image: the product's initial. */
  readonly initial = computed(() => this.product().name.charAt(0).toUpperCase());

  /** Pack size (colisage / PCB); `1` = no pack. */
  readonly packSize = computed(() => this.product().step ?? 1);
  /** Whether this product can be ordered by pack (has a PCB > 1). */
  readonly hasPack = computed(() => this.packSize() > 1);

  /** Ordering mode — by pack (multiples of `packSize`) or by unit. Defaults to
   *  by-pack when a pack exists; resets when the product changes. */
  readonly byPack = linkedSignal<FoldProduct, boolean>({
    source: this.product,
    computation: () => (this.product().step ?? 1) > 1,
  });

  /** Effective order multiple: the pack size in pack mode, else 1. */
  readonly step = computed(() => (this.byPack() ? this.packSize() : 1));
  /** Minimum orderable quantity — one pack in pack mode, else one unit. */
  readonly minQty = computed(() => this.step());

  /** Label of the pack option, e.g. "Par 10". */
  readonly packOptionLabel = computed(() => this.product().packLabel ?? `Par ${this.packSize()}`);

  /** The quantity to add — snaps to the minimum whenever the product OR the
   *  ordering mode changes (switching unit ↔ pack resets to one pack/unit). */
  readonly quantity = linkedSignal(() => this.minQty());

  /** Add-button text with the chosen quantity, e.g. "Ajouter 10". */
  readonly addText = computed(() => `${this.addLabel()} ${this.quantity()}`);

  /** Live line subtotal (numeric price × qty), formatted by the parent's
   *  formatter — or `null` when there is no numeric price / no formatter. */
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
