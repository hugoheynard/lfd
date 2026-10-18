import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { CartSuggestionReason, CartSuggestionView } from '@lfd/contracts';
import { FoldIconComponent } from 'fold-ng';

import { ProductAudience } from '../../audience/product-audience.service';
import { CartEntries } from '../../cart/cart-entries';
import { ClientCart } from '../../cart/client-cart.service';
import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { PieceRequest } from '../../shop/piece-request.service';
import { shelfPriceLabel, ShopPriceBasis } from '../../shop/shop-price-basis.service';

/**
 * **La carte d'une suggestion du staff** (RS2) — une au panier, une sur la
 * fiche, la même : la phrase du staff dans la langue du client, sinon le
 * titre par défaut de l'emplacement (« Notre conseil » au panier, « Vous
 * aimerez aussi » sur la fiche — Hugo, 2026-10-18) ; le nom ; le prix dans
 * l'assiette du rayon, par la même fonction que la vignette.
 *
 * Deux gestes (Hugo, 2026-10-18) : un clic sur la carte ouvre la fiche de
 * l'article suggéré ({@link PieceRequest}, qui mène à la boutique au besoin)
 * et émet `opened` ; SEUL le « + » ajoute une pièce au panier, émet `taken`
 * — avant l'ajout — et compte `added_to_cart` au passage de zéro à une pièce
 * (le taux d'ajout global inclut les suggestions). Les compteurs
 * `suggestion_*` sont à l'hôte, qui sait d'où la carte est montrée :
 * `suggestion_clicked` sur `opened`, `suggestion_added` sur `taken`.
 *
 * Une suggestion CALCULÉE (R2, au panier seulement) a la même carte : son
 * titre dit sa raison, « Souvent pris avec … » et le nom de l'article du
 * panier (`shop.boughtWith`) — jamais combien de clients.
 *
 * Générique sur la vue : la fiche et l'accueil, qui ne servent que le
 * décidé, reçoivent leurs propres vues en retour.
 */
@Component({
  selector: 'app-staff-suggestion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './staff-suggestion-card.html',
  styleUrl: './staff-suggestion-card.scss',
})
export class StaffSuggestionCard<V extends CartSuggestionView = CartSuggestionView> {
  readonly view = input.required<V>();
  /** Le titre quand la règle n'a pas de phrase dans la langue du client. */
  readonly fallbackTitle = input.required<string>();

  /** Le « + » : l'article entre au panier. */
  readonly taken = output<V>();
  /** La carte : la fiche de l'article s'ouvre. */
  readonly opened = output<V>();

  private readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);
  private readonly basis = inject(ShopPriceBasis);
  private readonly cart = inject(ClientCart);
  private readonly audience = inject(ProductAudience);
  private readonly entries = inject(CartEntries);
  private readonly pieces = inject(PieceRequest);

  protected readonly card = computed(() => {
    const view = this.view();
    const shop = this.t().shop;
    const ttc = this.basis.showsTtc();
    return {
      title: this.titleOf(view.reason, shop.boughtWith),
      line: view.item.name,
      price: shelfPriceLabel(view.item, ttc),
      suffix: ttc ? shop.ttcSuffix : shop.htSuffix,
      addLabel: fill(shop.addAria, { name: view.item.name }),
    };
  });

  private titleOf(reason: CartSuggestionReason, boughtWith: string): string {
    if (reason.source === 'data') {
      return fill(boughtWith, { name: reason.withName });
    }
    return reason.phrase?.[this.locale.current()] ?? this.fallbackTitle();
  }

  protected open(): void {
    const view = this.view();
    this.opened.emit(view);
    this.pieces.open(view.sku);
  }

  protected take(): void {
    const view = this.view();
    this.taken.emit(view);
    const entering = this.cart.quantityOf(view.sku) === 0;
    if (entering) {
      this.audience.record(view.sku, 'added_to_cart');
    }
    this.cart.add(view.sku);
    if (entering && this.cart.quantityOf(view.sku) > 0) {
      this.entries.entered(view.sku);
    }
  }
}
