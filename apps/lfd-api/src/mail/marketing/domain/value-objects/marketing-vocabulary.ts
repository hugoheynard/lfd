/**
 * Les listes fermées du registre de préférence marketing (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règles 10, 18,
 * 20 ; lot U2). Chacune a sa contrainte CHECK en base, sur la même liste.
 */

/** `pending` : accord recueilli, pas encore confirmé (règle 18). */
export const MARKETING_STATUSES = ["pending", "accepted", "unsubscribed"] as const;
export type MarketingStatus = (typeof MARKETING_STATUSES)[number];

/** D'où vient un accord : la société elle-même, ou la case « partenaires » (règle 20). */
export const CONSENT_ORIGINS = ["direct", "partners"] as const;
export type ConsentOrigin = (typeof CONSENT_ORIGINS)[number];

/** Le lieu où l'accord a été recueilli (règles 13 et 18, C5). */
export const CONSENT_PLACES = ["signup", "preferences", "order", "newsletter", "staff"] as const;
export type ConsentPlace = (typeof CONSENT_PLACES)[number];

/**
 * Ce qui a désinscrit : le bouton de la page (`link`), le POST « One-Click »
 * d'une messagerie (`one_click`), le staff à la demande du client (`staff`),
 * ou « Ne plus rien recevoir du groupe » depuis un autre espace (`group`).
 */
export const UNSUBSCRIBE_SOURCES = ["link", "one_click", "staff", "group"] as const;
export type UnsubscribeSource = (typeof UNSUBSCRIBE_SOURCES)[number];

/** La valeur de la liste, ou `null` si elle n'y est pas. */
export function oneOf<T extends string>(list: readonly T[], raw: string): T | null {
  return list.find((known) => known === raw) ?? null;
}
