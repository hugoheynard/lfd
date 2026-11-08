/**
 * **Les deux axes d'un envoi, tels que le suivi les sert** (plan
 * `le-suivi-des-e-mails.md`, décisions 1, 10, 12) : l'état de la demande
 * (notre côté) et le retour du fournisseur, en codes anglais.
 *
 * Fonctions pures : la base garde ses valeurs (`sent` ne se renomme pas), et
 * c'est ici que `sent` devient `accepted`, et qu'une acceptation sans
 * identifiant Resend devient `dry_run`.
 */

import type { MailRequestStatus } from "../../../requests/domain/entities/mail-request.js";
import type { MailDelivery } from "../../../requests/domain/value-objects/mail-delivery.js";

/** L'état en base (`mail.mail_request.status`). */
export type StoredMailStatus = MailRequestStatus;

/** Le retour en base (`mail.mail_request.delivery`). */
export type StoredMailDelivery = MailDelivery;

export type MailSendState = "requested" | "sending" | "accepted" | "failed" | "refused";
export type MailSendDelivery = StoredMailDelivery | "dry_run";

/** L'état servi : `sent` est une ACCEPTATION, rien de plus (décision 12). */
export function mailSendStateOf(status: StoredMailStatus): MailSendState {
  return status === "sent" ? "accepted" : status;
}

/** L'état en base qu'un état servi désigne — le filtre de la liste. */
export function storedStatusOf(state: MailSendState): StoredMailStatus {
  return state === "accepted" ? "sent" : state;
}

/**
 * Le retour servi. Une demande acceptée sans identifiant Resend l'a été À
 * BLANC (décision 10) : aucun e-mail n'est parti, et rien ne reviendra —
 * `dry_run`, jamais `null` (« rien reçu »).
 */
export function mailSendDeliveryOf(
  status: StoredMailStatus,
  providerId: string | null,
  delivery: StoredMailDelivery | null,
): MailSendDelivery | null {
  if (status === "sent" && providerId === null) {
    return "dry_run";
  }
  return delivery;
}

/** Le rang d'un problème : 0 vient en tête, `NO_PROBLEM` ferme la marche. */
export const NO_PROBLEM = 3;

/**
 * **Les problèmes d'abord** : échoué ou refusé (0), rebondi ou signalé comme
 * spam (1), retardé (2), puis le reste. Le SQL de la liste dit la même règle
 * (`PrismaMailSendReader`), éprouvée par l'e2e.
 */
export function problemRankOf(
  status: StoredMailStatus,
  delivery: StoredMailDelivery | null,
): number {
  if (status === "failed" || status === "refused") {
    return 0;
  }
  if (delivery === "bounced" || delivery === "complained") {
    return 1;
  }
  return delivery === "delayed" ? 2 : NO_PROBLEM;
}
