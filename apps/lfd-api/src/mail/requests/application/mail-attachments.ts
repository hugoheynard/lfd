import { Injectable } from "@nestjs/common";

import { MailAttachmentMissingError } from "../domain/errors/mail-request.errors.js";
import { MailAttachmentStore } from "../domain/ports/mail-attachment.store.js";
import type { OutgoingMail } from "../domain/ports/mail-dispatch.js";
import {
  type StoredPdfRef,
  storedPdfsIn,
  withPdfContents,
} from "../domain/services/stored-pdfs.js";

const placeOf = (ref: StoredPdfRef): string => `${ref.store}:${ref.key}`;

/**
 * **Les pièces jointes relues au moment de l'envoi** (plan C2) : chaque
 * référence au stockage que la demande porte devient le contenu que le
 * gabarit attend. Une demande sans pièce repart telle quelle, sans lecture.
 *
 * Appelé à chaque essai — après la validation, au balayeur, par `sendNow` :
 * la pièce n'est jamais recopiée dans la boîte d'envoi ni dans le suivi.
 */
@Injectable()
export class MailAttachments {
  constructor(private readonly store: MailAttachmentStore) {}

  /** @throws {MailAttachmentMissingError} une pièce n'est pas à sa place. */
  async resolve(mail: OutgoingMail): Promise<OutgoingMail> {
    const refs = storedPdfsIn(mail.data);
    if (refs.length === 0) {
      return mail;
    }
    const contents = new Map<string, string>();
    for (const ref of refs) {
      const bytes = await this.store.readIfPresent(ref);
      if (bytes === null) {
        throw new MailAttachmentMissingError(ref.key);
      }
      contents.set(placeOf(ref), bytes.toString("base64"));
    }
    const contentOf = (ref: StoredPdfRef): string => {
      const content = contents.get(placeOf(ref));
      if (content === undefined) {
        throw new MailAttachmentMissingError(ref.key);
      }
      return content;
    };
    return { ...mail, data: withPdfContents(mail.data, contentOf) };
  }
}
