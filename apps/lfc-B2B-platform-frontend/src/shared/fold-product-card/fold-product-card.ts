import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { FoldBadgeComponent, FoldToggleIconComponent } from 'fold-ng';

import { FoldActionButtonComponent } from '../fold-action';
import type { FoldProduct } from './fold-product.model';

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
  imports: [FoldBadgeComponent, FoldToggleIconComponent, FoldActionButtonComponent],
  templateUrl: './fold-product-card.html',
  styleUrl: './fold-product-card.scss',
})
export class FoldProductCardComponent {
  /** The product to render. */
  readonly product = input.required<FoldProduct>();

  /** Whether this product is currently favourited (controlled by the parent). */
  readonly favorite = input(false);

  /** Emphasis of the action button. */
  readonly actionEmphasis = input<'solid' | 'soft' | 'outline'>('soft');

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

  /** Fired when the card's action is activated. */
  readonly action = output<FoldProduct>();

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

  onAction(): void {
    this.action.emit(this.product());
  }

  onFavorite(): void {
    this.favoriteToggle.emit(this.product());
  }

  onNotify(): void {
    this.notify.emit(this.product());
  }
}
