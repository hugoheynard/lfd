import { StreamableFile } from "@nestjs/common";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";

import type { LegalDocumentFileDownload } from "../application/get-legal-document-file.query.js";

/**
 * La réponse HTTP d'un PDF de référence, commune aux surfaces publique et
 * staff (plan `legal/plan-cgv-par-audience.md`, C3′) : `application/pdf`, en
 * `attachment` sous un nom daté.
 *
 * 🔴 `attachment`, jamais `inline` : ces octets sont TÉLÉVERSÉS. Même
 * contrôlés à la signature `%PDF-`, les rendre dans notre origine est le geste
 * que `contentDispositionInline` interdit sur du contenu déposé.
 */
export function legalDocumentFileResponse(
  download: LegalDocumentFileDownload,
  response: Response,
): StreamableFile {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader(
    "Content-Disposition",
    contentDispositionAttachment(sanitiseFileName(download.fileName, "cgv.pdf")),
  );
  return new StreamableFile(download.bytes);
}
