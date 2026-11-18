import type { Buffer } from "node:buffer";

import { Injectable } from "@nestjs/common";

import type { AllergenMatrixPaper } from "../domain/allergen-matrix-paper.js";
import { AllergenMatrixRenderer } from "../domain/ports/allergen-matrix.renderer.js";
import { renderAllergenMatrixPdf } from "./allergen-matrix-pdf.js";

/** Le rendu PDF de la matrice, par la trousse `platform/pdf` du dépôt. */
@Injectable()
export class PdfAllergenMatrixRenderer extends AllergenMatrixRenderer {
  renderAllergenMatrixPdf(paper: AllergenMatrixPaper, logo: Buffer): Promise<Buffer> {
    return renderAllergenMatrixPdf(paper, logo);
  }
}
