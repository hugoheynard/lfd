import { StreamableFile } from "@nestjs/common";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";

import type { InvoiceDocument } from "../application/invoice-document-support.js";

/**
 * La réponse HTTP d'un PDF de facture (E3b), commune aux deux surfaces :
 * `application/pdf`, en `attachment` — une facture se garde, elle ne se
 * regarde pas dans l'origine de l'app — sous le nom de la pièce.
 */
export function invoicePdfResponse(document: InvoiceDocument, response: Response): StreamableFile {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader(
    "Content-Disposition",
    contentDispositionAttachment(sanitiseFileName(document.fileName, "facture.pdf")),
  );
  return new StreamableFile(document.bytes);
}
