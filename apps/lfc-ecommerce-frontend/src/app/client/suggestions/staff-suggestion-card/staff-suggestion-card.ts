import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { CartSuggestionView } from '@lfd/contracts';
import { FoldIconComponent } from 'fold-ng';

import { ProductAudience } from '../../audience/product-audience.service';
import { CartEntries } from '../../cart/cart-entries';
import { ClientCart } from '../../cart/client-cart.service';
import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { shelfPriceLabel, ShopPriceBasis } from '../../shop/shop-price-basis.service';

/**
 * **La carte d'une suggestion du staff** (RS2) — une au panier, une sur la
 * fiche, la même : la phrase du staff dans la langue du client, sinon le
 * titre par défaut de l'emplacement (« Notre conseil » au panier, « Vous
 * aimerez aussi » sur la fiche — Hugo, 2026-10-18) ; le nom ; le prix dans
 * l'assiette du rayon, par la même fonction que la vignette.
 *
 * Le « + » ajoute une pièce au panier et compte `added_to_cart` au passage de
 * zéro à une pièce (Hugo, 2026-10-18 : le taux d'ajout global inclut les
 * suggestions). Les compteurs `suggestion_*` sont à l'hôte, qui sait d'où
 * la carte est montrée : il les pose sur `taken`, émis AVANT l'ajout.
 */
@Component({
  selector: 'app-staff-suggestion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './staff-suggestion-card.html',
  styleUrl: './staff-suggestion-card.scss',
})
export class StaffSuggestionCard {
  readonly view = input.required<CartSuggestionView>();
  /** Le titre quand la règle n'a pas de phrase dans la langue du client. */
  readonly fallbackTitle = input.required<string>();

  readonly taken = output<CartSuggestionView>();

  private readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);
  private readonly basis = inject(ShopPriceBasis);
  private readonly cart = inject(ClientCart);
  private readonly audience = inject(ProductAudience);
  private readonly entries = inject(CartEntries);

  protected readonly card = computed(() => {
    const view = this.view();
    const shop = this.t().shop;
    const ttc = this.basis.showsTtc();
    return {
      title: view.reason.phrase?.[this.locale.current()] ?? this.fallbackTitle(),
      line: view.item.name,
      price: shelfPriceLabel(view.item, ttc),
      suffix: ttc ? shop.ttcSuffix : shop.htSuffix,
    };
  });

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
