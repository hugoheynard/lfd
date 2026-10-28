import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { SuggestionReason, SuggestionView } from '@lfd/contracts';
import { FoldIconComponent } from 'fold-ng';

import { ProductAudience } from '../../audience/product-audience.service';
import { CartEntries } from '../../cart/cart-entries';
import { ClientCart } from '../../cart/client-cart.service';
import { ClientLocale } from '../../client-locale.service';
import type { ClientCopy } from '../../copy/client-copy.model';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { PieceRequest } from '../../shop/piece-request.service';
import { ProVisit } from '../../shop/pro-visit.service';
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
 * Un HABITUEL d'un pro (R1, à l'accueil) a la même carte encore : son titre
 * est sa raison, « Tous les mardis » ou « Commandé 6 fois ».
 *
 * Générique sur la vue : la fiche et l'accueil, qui ne servent que le
 * décidé, reçoivent leurs propres vues en retour.
 */
/** Les textes de la boutique qui mettent une raison calculée en phrase. */
type ReasonCopy = Pick<ClientCopy['shop'], 'boughtWith' | 'usualEvery' | 'usualOrdered'>;

@Component({
  selector: 'app-staff-suggestion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './staff-suggestion-card.html',
  styleUrl: './staff-suggestion-card.scss',
})
export class StaffSuggestionCard<V extends SuggestionView = SuggestionView> {
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
  private readonly proVisit = inject(ProVisit).active;

  protected readonly card = computed(() => {
    const view = this.view();
    const shop = this.t().shop;
    const ttc = this.basis.showsTtc();
    return {
      title: this.titleOf(view.reason, shop),
      line: view.item.name,
      price: shelfPriceLabel(view.item, ttc, this.t().product.perKilogram),
      suffix: ttc ? shop.ttcSuffix : shop.htSuffix,
      // En visite pro, le « + » ouvre la connexion — et le dit.
      addLabel: fill(this.proVisit() ? shop.addAriaProVisit : shop.addAria, {
        name: view.item.name,
      }),
    };
  });

  private titleOf(reason: SuggestionReason, shop: ReasonCopy): string {
    if (reason.source === 'staff') {
      return reason.phrase?.[this.locale.current()] ?? this.fallbackTitle();
    }
    switch (reason.kind) {
      case 'bought_with':
        return fill(shop.boughtWith, { name: reason.withName });
      case 'weekly_rhythm':
        return shop.usualEvery[reason.weekday];
      case 'frequent':
        return fill(shop.usualOrdered, { count: String(reason.orderCount) });
    }
  }

  protected open(): void {
    const view = this.view();
    this.opened.emit(view);
    this.pieces.open(view.sku);
  }

  protected take(): void {
    const view = this.view();
    const entering = this.cart.quantityOf(view.sku) === 0;
    // La visite pro détourne le geste vers la connexion : ni `taken`, ni compte.
    if (this.cart.admit() === 'signInRequired') {
      return;
    }
    this.taken.emit(view);
    if (entering) {
      this.audience.record(view.sku, 'added_to_cart');
    }
    this.cart.add(view.sku);
    if (entering && this.cart.quantityOf(view.sku) > 0) {
      this.entries.entered(view.sku);
    }
  }
}
