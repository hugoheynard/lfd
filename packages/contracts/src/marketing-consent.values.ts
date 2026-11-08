/**
 * **Les cases du consentement marketing, côté boutique** — sans zod (entrée
 * `@lfd/contracts/shop-values` comprise). Plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, lots C2, C3, C5.
 *
 * La boutique affiche le texte de chaque case depuis SON dictionnaire, dans
 * les trois langues ; l'API range la VERSION de ce texte et sa langue, c'est
 * la preuve que la CNIL demande (règles 10 et 18). Changer un texte, c'est
 * publier une version de plus ici — jamais réécrire une version existante :
 * les accords déjà rangés la citent.
 */

/**
 * Les sociétés auxquelles la boutique demande l'accord — aujourd'hui la
 * boulangerie seule (`lfc`). `lfd` est l'espace de l'équipe et n'en sera
 * jamais (règle 19).
 */
export const MARKETING_CONSENT_SPACES = ["lfc"] as const;
export type MarketingConsentSpace = (typeof MARKETING_CONSENT_SPACES)[number];

/** La société qui vend sur la boutique : celle de la case à l'inscription et à la commande. */
export const SHOP_MARKETING_SPACE: MarketingConsentSpace = "lfc";

/**
 * La version COURANTE du texte de chaque case. La même version vaut pour les
 * trois langues : un texte changé dans une seule langue en publie une neuve.
 *
 * - `society` : « J'accepte de recevoir les offres de La Folie Coffee »
 *   (inscription, commande, « Mes préférences ») ;
 * - `partners` : la case des autres sociétés du groupe (éteinte, règle 19) ;
 * - `newsletter` : la phrase du champ du pied de page (C5).
 */
export const MARKETING_CONSENT_TEXT_VERSIONS = {
  society: "society.v1",
  partners: "partners.v1",
  newsletter: "newsletter.v1",
} as const;

/**
 * Toutes les versions jamais publiées, par case — l'API refuse une version
 * qu'aucun texte n'a portée. On AJOUTE à ces listes, on n'en retire jamais.
 */
export const PUBLISHED_MARKETING_TEXT_VERSIONS = {
  society: ["society.v1"],
  partners: ["partners.v1"],
  newsletter: ["newsletter.v1"],
} as const;

/**
 * L'état d'une adresse pour une société, tel que « Mes préférences » le
 * montre : `subscribed` (accord confirmé), `pending` (en attente du clic de
 * l'e-mail de confirmation), `not_subscribed` (jamais demandé), `unsubscribed`
 * (désinscrite — seul le geste de « Mes préférences » la réinscrit).
 */
export const MARKETING_PREFERENCE_STATES = [
  "subscribed",
  "pending",
  "not_subscribed",
  "unsubscribed",
] as const;
export type MarketingPreferenceState = (typeof MARKETING_PREFERENCE_STATES)[number];

/** Une société, vue par la personne connectée — SES adresses, jamais celles d'un autre. */
export interface MyMarketingSpaceView {
  readonly space: MarketingConsentSpace;
  readonly state: MarketingPreferenceState;
  /**
   * Faut-il montrer la case de cette société à la commande ? Vrai seulement
   * sans ligne au registre (`not_subscribed`, règle 17) — calculé pour
   * l'adresse du compte connecté seulement : un invité voit TOUJOURS la case.
   */
  readonly askable: boolean;
}

/** `GET /me/marketing` — « Mes préférences », et la question de la case à la commande. */
export interface MyMarketingPreferencesView {
  readonly spaces: readonly MyMarketingSpaceView[];
  /**
   * La case « partenaires » est-elle proposée ? Faux tant que le groupe n'a
   * pas deux sociétés qui envoient du marketing (règle 19) : la boutique ne
   * l'affiche pas.
   */
  readonly partnersOffered: boolean;
}
