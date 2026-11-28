import { Injectable } from "@nestjs/common";

import { CustomerDocumentStore } from "../../../platform/storage/customer-document-store.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { MailAttachmentStore } from "../domain/ports/mail-attachment.store.js";
import type { StoredPdfRef } from "../domain/services/stored-pdfs.js";

/**
 * Les pièces jointes relues aux stockages de `platform/storage` : celui des
 * pièces attachées à un client (le bon de commande, la facture…) et celui du
 * fournil (le dossier du jour, rangé par version). Un stockage de plus = une
 * valeur de plus dans `MAIL_ATTACHMENT_STORES` et son port injecté ici.
 */
@Injectable()
export class StorageMailAttachmentStore extends MailAttachmentStore {
  constructor(
    private readonly customers: CustomerDocumentStore,
    private readonly production: ProductionDocumentStore,
  ) {
    super();
  }

  readIfPresent(ref: StoredPdfRef): Promise<Buffer | null> {
    return ref.store === "production-documents"
      ? this.production.readIfPresent(ref.key)
      : this.customers.readIfPresent(ref.key);
  }
}
