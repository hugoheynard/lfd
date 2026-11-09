import type { MailSendSpace } from "./mail-sends.js";

/**
 * **Le registre de préférence marketing, vu par le staff** — ce que
 * `GET /admin/mail/preferences*` sert au back-office, sous le droit
 * `mail_sends` (plan `documentation/mail/plan-desinscription-des-e-mails.md`,
 * règle 8 et lot C4).
 *
 * Les valeurs sont des CODES anglais, celles des contraintes CHECK de
 * `mail.mail_marketing_preference` : le back-office les traduit. L'adresse
 * est masquée partout (`c•••@halles.fr`, comme le suivi des envois) ; elle ne
 * se lit en clair que par `GET /admin/mail/preferences/:id/recipient`, après
 * une révélation tracée. Le staff peut DÉSINSCRIRE ; aucune route ne
 * réinscrit — seul un nouvel accord du client le fait.
 */

/** L'état d'une ligne : en attente du clic de confirmation, accord confirmé, désinscrite. */
export const MAIL_PREFERENCE_STATUSES = ["pending", "accepted", "unsubscribed"] as const;
export type MailPreferenceStatus = (typeof MAIL_PREFERENCE_STATUSES)[number];

/** D'où vient un accord : la société elle-même, ou la case « partenaires ». */
export const MAIL_CONSENT_ORIGINS = ["direct", "partners"] as const;
export type MailConsentOrigin = (typeof MAIL_CONSENT_ORIGINS)[number];

/** Le lieu où l'accord a été recueilli. */
export const MAIL_CONSENT_PLACES = [
  "signup",
  "preferences",
  "order",
  "newsletter",
  "staff",
] as const;
export type MailConsentPlace = (typeof MAIL_CONSENT_PLACES)[number];

/**
 * Ce qui a désinscrit : le bouton de la page (`link`), le POST « One-Click »
 * d'une messagerie (`one_click`), le staff à la demande du client (`staff`),
 * « Ne plus rien recevoir du groupe » (`group`).
 */
export const MAIL_UNSUBSCRIBE_SOURCES = ["link", "one_click", "staff", "group"] as const;
export type MailUnsubscribeSource = (typeof MAIL_UNSUBSCRIBE_SOURCES)[number];

/** Une ligne de `GET /admin/mail/preferences`. */
export interface MailPreferenceListItemView {
  readonly id: string;
  readonly space: MailSendSpace;
  readonly status: MailPreferenceStatus;
  /** Masquée (`c•••@halles.fr`) ; `null` : l'adresse a été effacée, seule son empreinte reste. */
  readonly recipient: string | null;
  /** `null` : aucun accord n'a jamais été recueilli (désinscrite d'emblée). */
  readonly origin: MailConsentOrigin | null;
  /** Le lieu de l'accord ; `null` sans accord recueilli. */
  readonly place: MailConsentPlace | null;
  /** ISO 8601 ; `null` sans accord recueilli. */
  readonly requestedAt: string | null;
  /** ISO 8601 : l'instant de la confirmation ; `null` tant qu'elle n'a pas eu lieu. */
  readonly confirmedAt: string | null;
  /** ISO 8601 ; `null` : pas désinscrite. */
  readonly unsubscribedAt: string | null;
  readonly unsubscribedSource: MailUnsubscribeSource | null;
}

/** `GET /admin/mail/preferences` — les plus récentes d'abord, par pages. */
export interface MailPreferenceListView {
  readonly items: readonly MailPreferenceListItemView[];
  /** À repasser en `cursor` pour la page suivante ; `null` : c'est la fin. */
  readonly nextCursor: string | null;
}

/** **La preuve d'un accord** : ce que la CNIL demande de pouvoir montrer (règle 18). */
export interface MailConsentProofView {
  /** La version du texte de la case (`society.v1`). */
  readonly textVersion: string;
  /** La langue du texte accepté. */
  readonly locale: string;
  readonly place: MailConsentPlace;
  /** La référence opaque de l'acte (commande, compte) ; `null` sans acte (pied de page). */
  readonly ref: string | null;
}

/** `GET /admin/mail/preferences/:id` — adresse masquée, preuve comprise. */
export interface MailPreferenceDetailView extends MailPreferenceListItemView {
  /** `null` : aucun accord n'a jamais été recueilli. */
  readonly proof: MailConsentProofView | null;
}

/**
 * `GET /admin/mail/preferences/:id/recipient` — servi au seul membre du
 * staff qui a consulté cette adresse dans les 5 minutes.
 */
export interface MailPreferenceRecipientView {
  readonly id: string;
  readonly recipient: string;
  /** ISO 8601 : au-delà, il faut révéler de nouveau. */
  readonly revealedUntil: string;
}

/** `POST /admin/mail/preferences/searches` — l'identifiant de la recherche, à relire. */
export interface MailPreferenceSearchCreatedView {
  readonly id: string;
}

/**
 * `GET /admin/mail/preferences/searches/:id` — les lignes TROUVÉES à
 * l'instant de la recherche, masquées comme la liste ; servies à son seul
 * auteur, 5 minutes.
 */
export interface MailPreferenceSearchView {
  readonly id: string;
  /** ISO 8601 : l'instant de la recherche, auquel le résultat est figé. */
  readonly searchedAt: string;
  /** ISO 8601 : au-delà, il faut chercher de nouveau. */
  readonly readableUntil: string;
  readonly items: readonly MailPreferenceListItemView[];
}
