/**
 * **Les types de sujet d'un e-mail** (plan
 * `documentation/mail/plan-sujet-des-e-mails.md`, règle 1) — liste FERMÉE,
 * déclarée par le canal du bloc `mail` : un type neuf s'ajoute par une ligne.
 *
 * Le bloc ne lit jamais l'objet qu'un sujet désigne (`mail → b2b` reste
 * interdit) : il range le couple et le rend à qui le demande.
 */
export const MAIL_SUBJECT_TYPES = [
  "order",
  "account",
  "company",
  "invoice",
  "collection_batch",
  "mandate",
  "customer_request",
  "staff_member",
  "production_day",
  // Le rendez-vous pris (`staff.appointment-booked`) — ajouté le 2026-11-08 :
  // l'alerte a un objet, elle ne s'admet pas sans sujet.
  "appointment",
] as const;

export type MailSubjectType = (typeof MAIL_SUBJECT_TYPES)[number];

/** La longueur maximale d'un identifiant de sujet (règle 1). */
export const MAIL_SUBJECT_ID_MAX = 120;

/**
 * **Ce pour quoi un e-mail part** : un type fermé et un identifiant opaque
 * (« commande `cmd_123` »). Une demande en porte zéro, un ou plusieurs —
 * une facture nomme chacune de ses commandes (règle 2).
 */
export interface MailSubject {
  readonly type: MailSubjectType;
  /** Opaque pour le bloc `mail` : non vide, {@link MAIL_SUBJECT_ID_MAX} caractères au plus. */
  readonly id: string;
}

/** Vrai si `raw` est un type de sujet déclaré. */
export function isMailSubjectType(raw: string): raw is MailSubjectType {
  return MAIL_SUBJECT_TYPES.some((type) => type === raw);
}
