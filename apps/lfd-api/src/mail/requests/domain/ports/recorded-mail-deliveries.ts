import type { MailDeliveryReport } from "../value-objects/mail-delivery.js";

/**
 * Port de **lecture** des retours du fournisseur déjà rangés pour un
 * identifiant (`documentation/mail/le-suivi-des-e-mails.md`,
 * décision 2) : une demande qui reçoit son `provider_id` relit ceux arrivés
 * AVANT elle — un rebond rapide précède parfois l'écriture de l'envoi.
 */
export abstract class RecordedMailDeliveries {
  abstract recordedFor(providerId: string): Promise<readonly MailDeliveryReport[]>;
}
