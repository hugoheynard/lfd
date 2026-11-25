import {
  FunctionSheetNotPdfError,
  FunctionSheetTooLargeError,
  MissingFunctionSheetFileError,
} from "../errors/event-errors.js";

/** **20 Mo** par fiche : un Excel exporté en PDF en pèse quelques centaines de Ko. */
export const FUNCTION_SHEET_MAX_BYTES = 20 * 1024 * 1024;

/** Le seul type admis — il est relu dans les octets, pas seulement annoncé. */
export const FUNCTION_SHEET_CONTENT_TYPE = "application/pdf";

/** La signature d'un PDF, en tête de fichier. */
const PDF_MAGIC = "%PDF-";

/** Au-delà, un nom de fichier ne sert plus à reconnaître la fiche. */
const FILE_NAME_MAX_LENGTH = 200;

/** Le nom gardé quand le dépôt n'en annonce aucun. */
const DEFAULT_FILE_NAME = "fiche-de-fonction.pdf";

const BYTES_PER_MEGABYTE = 1024 * 1024;

/** Ce que le transport a reçu : les octets, le nom et le type annoncés. */
export interface FunctionSheetUpload {
  readonly bytes: Buffer | null;
  readonly fileName: string;
  readonly declaredContentType: string;
}

/**
 * **Une fiche de fonction déposée** — un PDF, et rien d'autre (option A,
 * décidée par Hugo le 2026-11-24) : le dossier du jour l'ajoutera telle
 * quelle, et un Excel ne s'imprime pas sans conversion.
 *
 * Deux preuves, parce qu'aucune ne suffit seule : le type annoncé par le
 * navigateur se falsifie, et des octets `%PDF-` sous un autre type disent
 * qu'on a renommé un fichier.
 */
export class FunctionSheetPdf {
  private constructor(
    readonly bytes: Buffer,
    readonly fileName: string,
  ) {}

  static create(upload: FunctionSheetUpload): FunctionSheetPdf {
    const { bytes } = upload;
    if (bytes === null || bytes.length === 0) {
      throw new MissingFunctionSheetFileError();
    }
    const fileName = cleanFileName(upload.fileName);
    if (bytes.length > FUNCTION_SHEET_MAX_BYTES) {
      throw new FunctionSheetTooLargeError(fileName, FUNCTION_SHEET_MAX_BYTES / BYTES_PER_MEGABYTE);
    }
    const declaredPdf =
      upload.declaredContentType.trim().toLowerCase() === FUNCTION_SHEET_CONTENT_TYPE;
    const startsAsPdf = bytes.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC;
    if (!declaredPdf || !startsAsPdf) {
      throw new FunctionSheetNotPdfError(fileName);
    }
    return new FunctionSheetPdf(bytes, fileName);
  }

  get sizeBytes(): number {
    return this.bytes.length;
  }

  get contentType(): string {
    return FUNCTION_SHEET_CONTENT_TYPE;
  }
}

function cleanFileName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return DEFAULT_FILE_NAME;
  }
  return trimmed.length > FILE_NAME_MAX_LENGTH ? trimmed.slice(0, FILE_NAME_MAX_LENGTH) : trimmed;
}
