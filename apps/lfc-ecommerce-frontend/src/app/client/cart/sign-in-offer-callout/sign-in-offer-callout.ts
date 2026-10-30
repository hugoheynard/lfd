import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldCalloutComponent } from 'fold-ng';

import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { offerDiscountLabel } from '../../shop/promotion-offers';
import { ClientCart } from '../client-cart.service';

/**
 * **« Vous avez un compte ? Connectez-vous pour profiter de −20 % »** (plan
 * des promotions, § 8, lot L10 — décision de Hugo du 2026-10-30).
 *
 * Dit à TOUT invité dont le panier serait touché par une promotion réservée
 * aux inscrits — jamais d'après l'adresse saisie : la boutique ne révèle pas
 * qu'une adresse a un compte. La promotion ne s'applique qu'après connexion,
 * et le devis reconnu la chiffre alors.
 */
@Component({
  selector: 'app-sign-in-offer-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  templateUrl: './sign-in-offer-callout.html',
})
export class SignInOfferCallout {
  private readonly t = inject(ClientCopyService).t;
  private readonly cart = inject(ClientCart);

  protected readonly message = computed(() => {
    const offer = this.cart.signInOffer();
    if (offer === null) {
      return null;
    }
    const copy = this.t();
    return offer.effect === null
      ? copy.cart.signInOfferPrices
      : fill(copy.cart.signInOffer, { discount: offerDiscountLabel(offer.effect, copy.product) });
  });
}
