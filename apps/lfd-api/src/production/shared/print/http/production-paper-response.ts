import { StreamableFile } from "@nestjs/common";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";

import type { ProductionPaper } from "../application/services/production-paper-archive.service.js";

export type { ProductionPaper };

/**
 * Sert un papier du fournil en PDF : les en-têtes écrits une fois, pour le
 * plan (dossier, compte à produire) comme pour l'atelier (fiche). Le nom du
 * fichier est assaini ici, parce qu'il vient d'une référence de commande.
 */
export function servePaper(response: Response, paper: ProductionPaper): StreamableFile {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader(
    "Content-Disposition",
    contentDispositionAttachment(sanitiseFileName(paper.fileName, "document.pdf")),
  );
  return new StreamableFile(paper.bytes);
}
