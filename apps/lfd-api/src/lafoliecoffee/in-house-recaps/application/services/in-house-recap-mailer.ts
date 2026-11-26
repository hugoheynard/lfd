import { Injectable } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { InHouseRecapNobodyToNotifyError } from "../../domain/errors/in-house-recap-errors.js";
import { RecapRecipientReader } from "../../domain/ports/recap-recipient.reader.js";
import type { KeptRecapDocument } from "./in-house-recap-document-keeper.js";

/** Le modèle de l'e-mail. */
const TEMPLATE = "customer.in-house-recap";

/**
 * **Demande l'e-mail du récapitulatif** (D10) au destinataire de la facture
 * du payeur, le PDF rangé joint PAR RÉFÉRENCE. `mail.send` : la demande
 * s'écrit dans une transaction, le bloc `mail` envoie après la validation.
 *
 * La clé d'idempotence vient de l'appelant, à partir de l'identifiant stable
 * du destinataire, jamais de son adresse.
 *
 * @throws {InHouseRecapNobodyToNotifyError} le payeur n'a personne à prévenir.
 */
@Injectable()
export class InHouseRecapMailer {
  constructor(
    private readonly recipients: RecapRecipientReader,
    private readonly uow: UnitOfWork,
    private readonly mail: Mail,
  ) {}

  async request(
    document: KeptRecapDocument,
    keyOf: (recipientId: string) => string,
    afterRequest: () => Promise<void> = () => Promise.resolve(),
  ): Promise<void> {
    const recipient = await this.recipients.recipientOf(document.payerId);
    if (recipient === null) {
      throw new InHouseRecapNobodyToNotifyError(document.number);
    }
    await this.uow.run(async () => {
      await this.mail.send({
        template: TEMPLATE,
        to: recipient.email,
        data: {
          payerName: document.payerName,
          month: document.month,
          recapNumber: document.number,
          replacesNumber: document.replacesNumber,
          document: {
            fileName: document.fileName,
            pdfStored: { store: "customer-documents", key: document.key },
          },
          locale: DEFAULT_MAIL_LOCALE,
        },
        subjects: [
          { type: "in_house_recap", id: document.recapId },
          { type: "company", id: document.payerId },
        ],
        idempotencyKey: keyOf(recipient.id),
      });
      await afterRequest();
    });
  }
}

/** La clé de l'envoi à l'émission : un récapitulatif ne part qu'une fois par destinataire. */
export function issuedRecapMailKey(recapId: string, recipientId: string): string {
  return `in-house-recap:${recapId}:${recipientId}`;
}
