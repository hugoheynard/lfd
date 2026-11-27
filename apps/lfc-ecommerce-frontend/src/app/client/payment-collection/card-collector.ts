import { DOCUMENT, Injectable, inject } from '@angular/core';
import type { CardCollection } from '@lfd/contracts';
import type { StripeElements, Stripe } from '@stripe/stripe-js';

import type { LocaleCode } from '../client-locale.service';
import { PAYMENT_ELEMENT_OPTIONS } from '../commande/payment-element-options';
import { StripeLoader } from '../stripe-loader.service';

/**
 * L'issue d'une collecte, telle que l'écran la dit :
 * - `succeeded` — le prestataire a encaissé ; le serveur l'apprendra par son
 *   webhook, qui fait foi ;
 * - `refused` — refusée, avec la phrase du prestataire quand il en donne une
 *   (« fonds insuffisants ») : elle est écrite pour le porteur de la carte ;
 * - `unfinished` — ni refusée ni encaissée (en cours, action à finir) ;
 * - `redirected` — le client part payer chez le prestataire.
 */
export type CollectOutcome =
  | { readonly kind: 'succeeded' }
  | { readonly kind: 'refused'; readonly message: string | null }
  | { readonly kind: 'unfinished' }
  | { readonly kind: 'redirected' };

/** Une collecte prête dans la page. */
export interface MountedCollection {
  /** La langue changée pendant le règlement suit dans les champs. */
  setLocale(locale: LocaleCode): void;
  /**
   * Le client a validé : on fait payer. `payerName` — le nom du client connecté,
   * transmis au prestataire comme titulaire ; **jamais l'e-mail**, que seul le
   * serveur pose (doc `documentation/payment/le-pointage-stripe.md`, § 5).
   * Absent, vide ou payeur anonyme (lien de paiement) : rien ne part.
   */
  collect(payerName?: string | null): Promise<CollectOutcome>;
}

/**
 * **Le seul endroit de la boutique qui connaît un prestataire de carte** (doc
 * `documentation/payment/les-liens-de-paiement.md`). Les écrans lui passent l'instruction de collecte que le serveur
 * rend (`CardCollection`) et un nœud où monter le formulaire ; ils ne gardent
 * que leur logique propre (phases, délai, abandon).
 *
 * - `embedded` / `stripe` : le Payment Element, les options de la boutique,
 *   confirmé sur place — seul 3-D Secure redirige (`redirect: 'if_required'`) ;
 * - `redirect` : rien à monter, `collect` envoie le client chez le prestataire.
 *
 * Rend `null` quand rien ne peut se monter (script du prestataire injoignable,
 * prestataire inconnu de la boutique) : l'écran dit « indisponible ».
 *
 * Écrit sans rien de propre à La Folie Coffee (ni textes, ni services de la
 * boutique au-delà du chargeur et des options) : il doit pouvoir rejoindre un
 * paquet partagé le jour où une autre application encaisse.
 */
@Injectable({ providedIn: 'root' })
export class CardCollector {
  private readonly stripeLoader = inject(StripeLoader);
  private readonly document = inject(DOCUMENT);

  async mount(
    collection: CardCollection,
    host: HTMLElement,
    locale: LocaleCode,
  ): Promise<MountedCollection | null> {
    if (collection.kind === 'redirect') {
      return redirectCollection(this.document, collection.url);
    }
    if (collection.provider !== 'stripe') {
      return null;
    }
    const stripe = await this.stripeLoader.load(collection.publishableKey);
    if (stripe === null) {
      return null;
    }
    const elements = stripe.elements({ clientSecret: collection.token, locale });
    elements.create('payment', PAYMENT_ELEMENT_OPTIONS).mount(host);
    return stripeCollection(stripe, elements, locale);
  }
}

function redirectCollection(document: Document, url: string): MountedCollection {
  return {
    setLocale: () => undefined,
    collect: () => {
      document.location.assign(url);
      return Promise.resolve({ kind: 'redirected' });
    },
  };
}

function stripeCollection(
  stripe: Stripe,
  elements: StripeElements,
  initialLocale: LocaleCode,
): MountedCollection {
  let mounted = initialLocale;
  return {
    setLocale: (locale) => {
      if (locale !== mounted) {
        mounted = locale;
        elements.update({ locale });
      }
    },
    collect: async (payerName) => {
      const name = payerName?.trim() ?? '';
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        ...(name === ''
          ? {}
          : { confirmParams: { payment_method_data: { billing_details: { name } } } }),
      });
      if (result.error !== undefined) {
        return { kind: 'refused', message: result.error.message ?? null };
      }
      return result.paymentIntent?.status === 'succeeded'
        ? { kind: 'succeeded' }
        : { kind: 'unfinished' };
    },
  };
}
