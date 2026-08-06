import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import type { FulfillmentMethod } from '@lfd/contracts';

import { formatEurValue } from '../../data/catalogue-seed';
import { type CartLine, CartService } from '../../data/cart.service';
import { CheckoutPanel } from '../../orders/checkout-panel/checkout-panel';
import { FulfillmentService } from '../../orders/fulfillment.service';

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
    // `auto` = tiroir latéral sur large, **bottom sheet** sur étroit (mobile),
    // piloté par la largeur de l'hôte (contrat « responsive sur sa propre largeur »).
    side: 'auto',
  };

  private readonly ref = inject(FoldPanelRef);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly router = inject(Router);
  protected readonly cart = inject(CartService);
  protected readonly fulfillment = inject(FulfillmentService);

  /** "2,50 €". */
  protected fmt(value: number): string {
    return formatEurValue(value);
  }

  /** Formate un montant en **centimes** (les ajustements raisonnent en centimes). */
  protected fmtCents(cents: number): string {
    return formatEurValue(cents / 100);
  }

  protected setMethod(method: FulfillmentMethod): void {
    this.fulfillment.setMethod(method);
  }

  /** Répercute la zone choisie (`<select>` natif) dans le service partagé. */
  protected onZone(event: Event): void {
    const el = event.target;
    this.fulfillment.setZone(el instanceof HTMLSelectElement ? el.value : '');
  }

  /** Répercute un champ d'adresse coursier (input natif) dans le service. */
  protected onAddress(field: 'ligne1' | 'ligne2' | 'codePostal' | 'ville', event: Event): void {
    const el = event.target;
    if (el instanceof HTMLInputElement) {
      this.fulfillment.patchAddress({ [field]: el.value });
    }
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

  /** Validation : ferme le panier et ouvre le checkout (choix livraison + envoi). */
  protected checkout(): void {
    this.ref.close();
    // Côté (latéral / bottom-sheet) hérité de `CheckoutPanel.foldPanel` (`auto`).
    this.panelHost.open(CheckoutPanel);
  }

  /** Ferme le panneau et ouvre la page panier complète (quantités, suggestions…). */
  protected viewFullCart(): void {
    this.ref.close();
    void this.router.navigate(['/panier']);
  }

  protected close(): void {
    this.ref.close();
  }
}
