import type { DriverNoticeAcknowledgement } from "../entities/driver-notice-acknowledgement.js";

/**
 * Port d'**écriture** des accusés de lecture du texte d'information.
 *
 * `save` est IDEMPOTENT : un second « J'ai compris » sur la même version
 * (deux onglets, un double appui) garde la PREMIÈRE date — c'est elle qui dit
 * quand le texte a été lu.
 */
export abstract class DriverNoticeAcknowledgementRepository {
  abstract save(acknowledgement: DriverNoticeAcknowledgement): Promise<void>;
}
