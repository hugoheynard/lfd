import type { MailSubject } from "../../../channels/requests/mail-subject.js";
import type { MailBrandCode } from "../value-objects/mail-brand.js";
import type { MailDelivery } from "../value-objects/mail-delivery.js";

/**
 * Les états d'une demande (plan `plan-service-e-mails.md`, C7) :
 *
 * - `requested` — écrite, pas encore partie ;
 * - `sending` — un envoi différé est engagé (S1b, plan § 8) : marqué dans la
 *   transaction de livraison, il part après la validation. Une demande qui y
 *   reste est un envoi orphelin (redémarrage entre les deux), que le
 *   balayeur reprend avec la même clé ;
 * - `sent` — acceptée par le fournisseur (pas « arrivée » : `CLAUDE.md` § 0) ;
 * - `failed` — l'envoi a échoué pour une raison technique ; un nouvel essai
 *   peut réussir ;
 * - `refused` — refusée pour une raison que réessayer ne changera pas.
 *
 * `sent` et `refused` sont terminaux.
 */
export const MAIL_REQUEST_STATUSES = ["requested", "sending", "sent", "failed", "refused"] as const;

export type MailRequestStatus = (typeof MAIL_REQUEST_STATUSES)[number];

/** Ce qu'il faut pour demander un e-mail. */
export interface MailRequestDraft {
  readonly id: string;
  readonly template: string;
  readonly brand: string;
  readonly recipient: string;
  readonly locale: string | null;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
  /** Ce pour quoi l'e-mail part (`plan-sujet-des-e-mails.md`, règle 2) ; absent = aucun. */
  readonly subjects?: readonly { readonly type: string; readonly id: string }[];
}

/** L'état complet, tel que l'adaptateur le range et le relit. */
export interface MailRequestSnapshot {
  readonly id: string;
  readonly template: string;
  readonly brand: MailBrandCode;
  readonly recipient: string;
  /**
   * L'adresse normalisée (minuscules) à laquelle une recherche compare (plan
   * `le-suivi-des-e-mails.md`, décision 9). Écrite par l'agrégat, jamais
   * par l'appelant.
   */
  readonly recipientKey: string;
  readonly locale: string | null;
  readonly idempotencyKey: string;
  readonly status: MailRequestStatus;
  readonly providerId: string | null;
  readonly failureReason: string | null;
  readonly requestedAt: Date;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
  /** L'instant du premier envoi différé engagé ; `null` sans envoi différé. */
  readonly firstAttemptAt: Date | null;
  /** L'instant du dernier envoi différé engagé. */
  readonly lastAttemptAt: Date | null;
  /** Les envois différés engagés. `sendAndAwaitReceipt` n'en compte pas : il ne passe pas par `sending`. */
  readonly attempts: number;
  /**
   * La version publiée du document qui a composé l'envoi (plan
   * `plan-editeur-par-blocs.md`, § 5, S4c) ; `null` : le document de départ,
   * ou rien d'envoyé encore. Avec `template`, elle dit QUEL texte est parti.
   */
  readonly documentVersion: number | null;
  /** Le retour du fournisseur (décision 1) ; `null` : rien reçu. */
  readonly delivery: MailDelivery | null;
  readonly deliveryAt: Date | null;
  /** Le genre du retour (`Permanent/Suppressed`), jamais son texte. */
  readonly deliveryKind: string | null;
  /**
   * Ce pour quoi l'e-mail part (`plan-sujet-des-e-mails.md`, règles 1 et 2),
   * fixé à la demande et jamais changé ensuite. Vide pour une demande sans
   * sujet, et pour toutes celles d'avant la table : rien n'est déduit.
   */
  readonly subjects: readonly MailSubject[];
}
