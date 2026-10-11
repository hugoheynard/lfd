import { Injectable } from '@angular/core';
import type {
  Stripe,
  StripeElements,
  StripePaymentElement,
  StripePaymentElementOptions,
} from '@stripe/stripe-js';

import { StripeLoader } from '../../../src/app/client/stripe-loader.service';

/** La classe de la place réservée — stylée dans `preview.scss`. */
export const PAYMENT_STAND_CLASS = 'preview-payment-stand';

/** Ce que l'écran de règlement montre à la place du formulaire de carte. */
export const PAYMENT_STAND_LABEL = 'Paiement (aperçu)';

/** Le refus de « Payer » en aperçu : rien ne part chez Stripe. */
export const PAYMENT_REFUSAL = "Aperçu : aucun paiement n'est envoyé.";

/**
 * **Le chargeur de Stripe de l'aperçu — il ne charge rien** (plan
 * `plan-textes-de-la-boutique.md`, §10 B3).
 *
 * L'écran de règlement monte l'élément de paiement de Stripe dans un cadre :
 * l'aperçu y pose une place RÉSERVÉE, de la même hauteur, qui dit ce qu'elle
 * est. Aucun script Stripe n'est injecté, aucune iframe de Stripe ouverte ;
 * « Payer » répond par un refus que l'écran affiche comme celui d'une carte.
 */
@Injectable()
export class DemoStripeLoader extends StripeLoader {
  override load(): Promise<Stripe | null> {
    return Promise.resolve(standInStripe());
  }
}

/**
 * Les trois gestes que l'écran de règlement fait sur Stripe — `elements`,
 * `create('payment').mount`, `confirmPayment` — et rien d'autre.
 *
 * ⚠️ Les types de Stripe portent une centaine de méthodes que l'écran
 * n'appelle pas. Chaque objet ci-dessous est un `Partial` de son type, puis
 * DÉCLARÉ complet par une conversion directe : c'est la seule affirmation de
 * type de l'aperçu, et elle est vraie de ce que l'écran touche. Un écran qui
 * appellerait une quatrième méthode lèverait en aperçu — c'est voulu : il
 * faudrait la simuler ici, pas la laisser partir chez Stripe.
 */
function standInStripe(): Stripe {
  const paymentElement: Partial<StripePaymentElement> = {
    mount: (target: string | HTMLElement) => paintStand(target),
  };
  const create = (_type: 'payment', _options?: StripePaymentElementOptions): StripePaymentElement =>
    paymentElement as StripePaymentElement;
  const elements: Partial<StripeElements> = { create: create as StripeElements['create'] };
  const stripe: Partial<Stripe> = {
    elements: () => elements as StripeElements,
    confirmPayment: () =>
      Promise.resolve({ error: { type: 'validation_error', message: PAYMENT_REFUSAL } }),
  };
  return stripe as Stripe;
}

function paintStand(target: string | HTMLElement): void {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (host === null) {
    return;
  }
  const stand = document.createElement('div');
  stand.className = PAYMENT_STAND_CLASS;
  stand.textContent = PAYMENT_STAND_LABEL;
  host.replaceChildren(stand);
}
