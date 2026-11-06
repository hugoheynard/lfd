import { Injectable } from "@nestjs/common";

import { CustomerDocumentStore } from "../../../platform/storage/customer-document-store.js";
import { MailAttachmentStore } from "../domain/ports/mail-attachment.store.js";
import type { StoredPdfRef } from "../domain/services/stored-pdfs.js";

/**
 * Les pièces jointes relues aux stockages de `platform/storage`. Un seul est
 * ouvert au 2026-11-06 : celui des pièces attachées à un client (le bon de
 * commande). Un stockage de plus = une valeur de plus dans
 * `MAIL_ATTACHMENT_STORES` et son port injecté ici.
 */
@Injectable()
export class StorageMailAttachmentStore extends MailAttachmentStore {
  constructor(private readonly customers: CustomerDocumentStore) {
    super();
  }

  readIfPresent(ref: StoredPdfRef): Promise<Buffer | null> {
    return this.customers.readIfPresent(ref.key);
  }
}
