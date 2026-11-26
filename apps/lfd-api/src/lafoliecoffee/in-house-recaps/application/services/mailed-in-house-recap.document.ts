import { Injectable } from "@nestjs/common";

import { InHouseRecapDocument } from "../../domain/ports/in-house-recap-document.js";
import { InHouseRecapDocumentKeeper } from "./in-house-recap-document-keeper.js";
import { InHouseRecapMailer, issuedRecapMailKey } from "./in-house-recap-mailer.js";

/**
 * **Le document d'un récapitulatif émis** (D10) : le PDF rendu et rangé,
 * puis l'e-mail demandé, le PDF joint par référence. Appelé après la
 * validation de l'émission (`announceIssued`) : un échec ici est journalisé
 * et laisse le récapitulatif sans PDF ni e-mail — « Renvoyer l'e-mail » le
 * rattrape.
 */
@Injectable()
export class MailedInHouseRecapDocument extends InHouseRecapDocument {
  constructor(
    private readonly keeper: InHouseRecapDocumentKeeper,
    private readonly mailer: InHouseRecapMailer,
  ) {
    super();
  }

  async afterIssued(recapId: string): Promise<void> {
    const document = await this.keeper.ensure(recapId);
    await this.mailer.request(document, (recipientId) => issuedRecapMailKey(recapId, recipientId));
  }
}
