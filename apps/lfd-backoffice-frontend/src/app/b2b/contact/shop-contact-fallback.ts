import type { ContactLocalizedText, CustomerAudience } from '@lfd/contracts';

/**
 * **Les textes de la boutique quand le réglage est vide** — recopiés pour
 * l'APERÇU de la carte de contact, et pour lui seul.
 *
 * Source : `apps/lfc-ecommerce-frontend/src/app/client/copy/screens/
 * accueil-public.copy.ts`, §`contact`, relu le 2026-10-09 après sa
 * simplification (Hugo : « pas de fallback trop compliqué ») : un titre commun
 * aux deux publics, une phrase par public, plus de note d'heure creuse ni de
 * distinction visiteur / client connecté.
 *
 * Pourquoi pas `DEFAULT_CONTACT_SETTINGS` (`@lfd/contracts`) : il dit « rien
 * n'est réglé », et la boutique lit le vide comme « garde ton texte ». Y mettre
 * ces phrases ferait servir par l'API des textes figés à la place du
 * dictionnaire. Si la boutique change ses mots, cet aperçu ment jusqu'à ce
 * qu'on recopie : c'est le prix, il est écrit ici.
 */
export interface ShopContactCopy {
  readonly kicker: ContactLocalizedText;
  readonly phone: string;
  readonly call: ContactLocalizedText;
  readonly write: ContactLocalizedText;
  readonly title: ContactLocalizedText;
  readonly body: Readonly<Record<CustomerAudience, ContactLocalizedText>>;
}

export const SHOP_CONTACT_FALLBACK: ShopContactCopy = {
  kicker: { fr: 'On répond', en: 'We answer', it: 'Rispondiamo' },
  phone: '+33 4 79 06 12 40',
  call: { fr: 'Appeler', en: 'Call', it: 'Chiamare' },
  write: { fr: 'Écrire', en: 'Write', it: 'Scrivere' },
  title: { fr: 'Nous contacter', en: 'Contact us', it: 'Contattaci' },
  body: {
    b2b: {
      fr: 'Nos équipes commerciales sont à votre écoute',
      en: 'Our sales team is here for you',
      it: 'Il nostro team commerciale è a vostra disposizione',
    },
    b2c: {
      fr: 'On répond au plus vite',
      en: 'We reply as soon as we can',
      it: 'Rispondiamo il prima possibile',
    },
  },
};
