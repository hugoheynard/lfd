import { InvalidLegalPdfError } from "../errors/legal-document-file-errors.js";

/** Taille maximale d'un PDF de référence — la même borne que les pièces numérisées. */
export const LEGAL_PDF_MAX_BYTES = 10 * 1024 * 1024;

/** Les octets de tête d'un PDF : `%PDF-`. */
const PDF_MAGIC = Buffer.from("%PDF-", "latin1");

/**
 * **Un PDF de référence des CGV**, validé par ses octets.
 *
 * 🔴 Une garde DÉDIÉE, et non `ScannedDocument` (plan
 * `legal/plan-cgv-par-audience.md`, C3′) : celle-là admet aussi JPEG, PNG et
 * HEIC, parce qu'un commercial photographie un KBIS au comptoir. Un document
 * juridique ne se photographie pas ; seule la signature `%PDF-` passe.
 *
 * Le `Content-Type` annoncé par le navigateur n'est jamais lu : il se
 * falsifie d'un champ de formulaire.
 */
export class LegalPdf {
  private constructor(readonly bytes: Buffer) {}

  /** @throws {InvalidLegalPdfError} vide, trop lourd, ou pas un PDF. */
  static create(bytes: Buffer): LegalPdf {
    if (bytes.length === 0) {
      throw new InvalidLegalPdfError("le fichier est vide.");
    }
    if (bytes.length > LEGAL_PDF_MAX_BYTES) {
      throw new InvalidLegalPdfError(`il dépasse ${LEGAL_PDF_MAX_BYTES / (1024 * 1024)} Mo.`);
    }
    if (!bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      throw new InvalidLegalPdfError("ce n'est pas un PDF.");
    }
    return new LegalPdf(bytes);
  }

  get size(): number {
    return this.bytes.length;
  }
}
