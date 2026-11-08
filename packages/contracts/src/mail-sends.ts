/**
 * **Le suivi des e-mails** — ce que `GET /admin/mail/sends*` sert au
 * back-office, sous le droit `mail_sends`
 * (`documentation/mail/plan-suivi-des-e-mails.md`, lot T2).
 *
 * Les états sont des CODES anglais (décision 12) : le back-office les traduit.
 * `accepted` est le `sent` de la base — Resend a accepté l'e-mail, rien de
 * plus ; la valeur en base ne se renomme pas.
 *
 * L'adresse du destinataire n'est servie EN CLAIR que par
 * `GET /admin/mail/sends/:id/recipient`, après une révélation tracée
 * (décision 7). Partout ailleurs elle est masquée (`c•••@halles.fr`), et la
 * raison d'un échec n'est jamais servie hors de la révélation : elle peut
 * citer l'adresse (décision 4).
 */

/** L'état de la DEMANDE, notre côté (décision 1). */
export const MAIL_SEND_STATES = ["requested", "sending", "accepted", "failed", "refused"] as const;
export type MailSendState = (typeof MAIL_SEND_STATES)[number];

/**
 * Le retour du FOURNISSEUR (décision 1). `dry_run` : acceptée à blanc, aucun
 * e-mail n'est parti (décision 10) — jamais confondu avec « rien reçu », qui
 * est `null`.
 */
export const MAIL_SEND_DELIVERIES = [
  "dry_run",
  "delayed",
  "delivered",
  "complained",
  "bounced",
] as const;
export type MailSendDelivery = (typeof MAIL_SEND_DELIVERIES)[number];

/** L'espace d'un envoi (`lfc` : les clients ; `lfd` : l'équipe et la plateforme). */
export const MAIL_SEND_SPACES = ["lfc", "lfd"] as const;
export type MailSendSpace = (typeof MAIL_SEND_SPACES)[number];

/**
 * Les envois listés : les envois ordinaires, ou la sonde de déploiement et
 * les autres e-mails hors de l'éditeur (`outOfEditor`), listés à part
 * (décision 10).
 */
export const MAIL_SEND_SCOPES = ["regular", "probes"] as const;
export type MailSendScope = (typeof MAIL_SEND_SCOPES)[number];

/** Une ligne de `GET /admin/mail/sends`. */
export interface MailSendListItemView {
  readonly id: string;
  /** La clé du registre (`customer.order-ready`). */
  readonly template: string;
  readonly space: MailSendSpace;
  /** Masquée : `c•••@halles.fr`. */
  readonly recipient: string;
  readonly state: MailSendState;
  /** `null` : rien reçu du fournisseur. */
  readonly delivery: MailSendDelivery | null;
  /** ISO 8601. */
  readonly requestedAt: string;
  /** Vrai pour un échec, un refus, un rebond, un spam ou un retard : en tête de liste. */
  readonly problem: boolean;
}

/**
 * `GET /admin/mail/sends` — les problèmes d'abord (échoué ou refusé, rebondi
 * ou spam, retardé), puis les plus récents.
 */
export interface MailSendListView {
  readonly items: readonly MailSendListItemView[];
  /** À repasser en `cursor` pour la page suivante ; `null` : c'est la fin. */
  readonly nextCursor: string | null;
}

/** Une étape datée d'un envoi, dans l'ordre où elle est arrivée. */
export const MAIL_SEND_STEPS = [
  "requested",
  "first_attempt",
  "last_attempt",
  "accepted",
  "failed",
  "refused",
  "delayed",
  "delivered",
  "complained",
  "bounced",
] as const;
export type MailSendStepKind = (typeof MAIL_SEND_STEPS)[number];

export interface MailSendStepView {
  readonly step: MailSendStepKind;
  /** ISO 8601. */
  readonly at: string;
}

/** `GET /admin/mail/sends/:id` — sans l'adresse en clair, sans la raison d'un échec. */
export interface MailSendDetailView extends MailSendListItemView {
  /** La langue de l'e-mail ; `null` si le modèle n'en déclare pas. */
  readonly locale: string | null;
  /** Le genre du retour (`Permanent/Suppressed`), jamais son texte. */
  readonly deliveryKind: string | null;
  /** La version publiée du document qui l'a composé ; `null` : le document de départ. */
  readonly documentVersion: number | null;
  /** Les envois différés engagés. */
  readonly attempts: number;
  readonly steps: readonly MailSendStepView[];
}

/**
 * `GET /admin/mail/sends/:id/recipient` — servi au seul membre du staff qui
 * a révélé cet envoi, dans les 5 minutes.
 */
export interface MailRecipientView {
  readonly id: string;
  readonly recipient: string;
  /** La raison d'un échec ou d'un refus ; `null` s'il n'y en a pas. */
  readonly failureReason: string | null;
  /** ISO 8601 : au-delà, il faut révéler de nouveau. */
  readonly revealedUntil: string;
}

/** `POST /admin/mail/sends/searches` — l'identifiant de la recherche, à relire. */
export interface MailRecipientSearchCreatedView {
  readonly id: string;
}

/**
 * `GET /admin/mail/sends/searches/:id` — les envois TROUVÉS à l'instant de la
 * recherche, masqués comme la liste ; servis à son seul auteur, 5 minutes.
 */
export interface MailRecipientSearchView {
  readonly id: string;
  /** ISO 8601 : l'instant de la recherche, auquel le résultat est figé. */
  readonly searchedAt: string;
  /** ISO 8601 : au-delà, il faut chercher de nouveau. */
  readonly readableUntil: string;
  readonly items: readonly MailSendListItemView[];
}
