import type { StripePaymentElementOptions } from '@stripe/stripe-js';

/**
 * Les options du Payment Element de la boutique : la carte et ses deux
 * portefeuilles, Apple Pay et Google Pay (Hugo, 2026-10-09 : « garder cb et
 * apple pay », puis « google pay aussi c'est bon » ; Klarna et le reste
 * dégagent).
 *
 * L'intention ne porte que `card` côté API (`accepted-payment-methods.ts`) :
 * c'est elle qui retire les autres moyens. Les portefeuilles sont posés en
 * `auto`, explicitement : chacun ne s'affiche que sur un appareil qui l'a
 * configuré, et si le domaine est enregistré chez Stripe (`lafoliecoffee.info`,
 * ajouté le 2026-10-09).
 *
 * L'ordre est celui d'Hugo (2026-10-09) : « apple pay google pay en premier et
 * ensuite cb ».
 */
export const PAYMENT_ELEMENT_OPTIONS: StripePaymentElementOptions = {
  wallets: { applePay: 'auto', googlePay: 'auto' },
  paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
};
