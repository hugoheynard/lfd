import type { StoredPdfRef } from "../services/stored-pdfs.js";

/**
 * Port de **lecture** : relire une pièce jointe que l'appelant a déposée au
 * stockage (plan C2). Le bloc ne l'écrit jamais — il la joint.
 *
 * @returns les octets, ou `null` si la pièce n'est pas (ou plus) à sa place.
 * @throws l'indisponibilité du stockage, technique : un nouvel essai peut réussir.
 */
export abstract class MailAttachmentStore {
  abstract readIfPresent(ref: StoredPdfRef): Promise<Buffer | null>;
}
