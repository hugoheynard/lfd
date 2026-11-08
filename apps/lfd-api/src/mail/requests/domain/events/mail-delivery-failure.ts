import type { MailSubject } from "../../../channels/requests/mail-subject.js";
import type { MailDeliveryFailureKind } from "../value-objects/mail-delivery.js";

/**
 * **Une demande est entrée dans l'échec** — ce que `MailRequest.recordDelivery`
 * note quand un retour la fait passer de « rien », `delayed` ou `delivered` à
 * `complained` ou `bounced` (`documentation/mail/le-sujet-des-e-mails.md`,
 * règle 4). Jamais l'adresse : le fait qui en naît part vers d'autres blocs.
 *
 * Le dépôt l'écrit à la boîte d'envoi dans la même unité de travail que la
 * demande (`MailRequestRepository.save`) : c'est l'agrégat qui décide, et un
 * seul point d'émission sert les trois chemins qui appliquent un retour.
 */
export interface MailDeliveryFailure {
  readonly requestId: string;
  readonly template: string;
  /** Au moins un : une demande sans sujet n'a personne à prévenir. */
  readonly subjects: readonly MailSubject[];
  readonly delivery: MailDeliveryFailureKind;
  /** Le genre du retour (`Permanent/Suppressed`), jamais son texte. */
  readonly kind: string | null;
  /** L'instant du retour chez le fournisseur. */
  readonly at: Date;
}
