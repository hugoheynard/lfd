import { domain, type ValueFamily } from './value-domain';

/**
 * **Le commerce** — prospects, rendez-vous, recommandations du cockpit
 * (famille `commerce` du catalogue des faits).
 */

/** L'étape où un prospect est passé (`lead.stage_changed`). */
export const LEAD_STATUS = domain('étape d’un prospect', {
  contacted: 'Contacté',
  qualified: 'Qualifié',
  negotiating: 'En négociation',
  converted: 'Converti',
  lost: 'Perdu',
});

/**
 * Les mêmes mots que le calendrier du commercial (`appointment-events.ts`,
 * `rendez-vous-page.ts`, `booking-policy-card.ts` — trois copies privées,
 * vérifié le 2026-09-19).
 */
export const APPOINTMENT_CHANNEL = domain('canal d’un rendez-vous', {
  phone: 'Téléphone',
  visio: 'Visio',
  onsite: 'Sur place',
});

/** Les mêmes mots que la file du cockpit (`play-queue.ts`, `PLAY`, vérifié le 2026-09-19). */
export const PLAY = domain('coup recommandé', {
  lock_in: 'Verrouiller',
  rescue: 'Rescousse',
  upgrade: 'Upgrade',
  win_back: 'Reconquête',
  nurture: 'Démarchage',
});

/** La langue d'un texte de la boutique publié (`shop_copy.published`). */
export const SHOP_COPY_LOCALE = domain('langue d’un texte de la boutique', {
  fr: 'Français',
  en: 'Anglais',
  it: 'Italien',
});

/** Ce qui déclenche une suggestion décidée (`staff_suggestion.*`, 2026-10-18). */
export const SUGGESTION_TRIGGER = domain('déclencheur d’une suggestion', {
  everywhere: 'Partout',
  product_in_cart: 'Article au panier',
  category_in_cart: 'Famille au panier',
  product_viewed: 'Fiche d’article ouverte',
});

/** Où une suggestion décidée s'affiche. */
export const SUGGESTION_PLACEMENT = domain('emplacement d’une suggestion', {
  cart: 'Panier',
  product: 'Fiche d’article',
  home: 'Accueil',
});

/** L'ordre entre suggestions concurrentes (`staff_suggestion_order.changed`). */
export const SUGGESTION_ORDER = domain('ordre des suggestions', {
  recent: 'La plus récente d’abord',
  priority: 'Par priorité',
});

export const COMMERCE_VALUES: ValueFamily = {
  enums: [
    LEAD_STATUS,
    APPOINTMENT_CHANNEL,
    PLAY,
    SHOP_COPY_LOCALE,
    SUGGESTION_TRIGGER,
    SUGGESTION_PLACEMENT,
    SUGGESTION_ORDER,
  ],
  literals: {
    // `lead.converted` : converti à la main, ou rapproché à l'inscription.
    manual: 'À la main',
    registration: 'À l’inscription du client',
  },
};
