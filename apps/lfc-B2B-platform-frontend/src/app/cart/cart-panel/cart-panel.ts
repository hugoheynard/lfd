import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { formatEurValue } from '../../data/catalogue-seed';
import { type CartLine, CartService } from '../../data/cart.service';

/**
 * Panneau **Mon panier** — ouvert via `FoldPanelHostService.open()`. Liste les
 * lignes (visuel, nom, prix unitaire), un pas-à-pas de quantité et une
 * suppression par ligne, puis le total et la validation. L'état vit dans
 * {@link CartService} (partagé), le panneau n'en est qu'une vue.
 */
@Component({
  selector: 'app-cart-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldButtonIconComponent],
  templateUrl: './cart-panel.html',
  styleUrl: './cart-panel.scss',
})
export class CartPanel {
  /**
   * Nature intrinsèque du panier : **non-modal** (on continue à parcourir la
   * boutique, le scroll principal reste vivant, un clic dehors ne ferme pas) et
   * surface **solid** (fond blanc opaque, pas de verre). Déclaré une fois ici →
   * le call-site ouvre simplement `open(CartPanel)`.
   */
  static readonly foldPanel: FoldPanelDefaults = {
    modal: false,
    surface: 'solid',
  };

  private readonly ref = inject(FoldPanelRef);
  protected readonly cart = inject(CartService);

  /** "2,50 €". */
  protected fmt(value: number): string {
    return formatEurValue(value);
  }

  protected inc(line: CartLine): void {
    this.cart.setQty(line.product.id, line.qty + 1);
  }

  protected dec(line: CartLine): void {
    this.cart.setQty(line.product.id, line.qty - 1);
  }

  protected remove(line: CartLine): void {
    this.cart.remove(line.product.id);
  }

  protected clear(): void {
    this.cart.clear();
  }

  /** Validation — placeholder tant que le backend commandes n'existe pas. */
  protected checkout(): void {
    this.ref.close(true);
  }

  protected close(): void {
    this.ref.close();
  }
}
