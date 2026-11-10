import { InvalidBankReturnFileError } from "../domain/errors/bank-return-file-errors.js";

/** La part d'un multipart que multer rend. */
export interface BankFilePart {
  readonly originalname: string;
  readonly buffer: Buffer;
}

/** Le fichier reçu, en texte ; refusé s'il manque ou s'il est vide. */
export function bankFileText(file: BankFilePart | undefined): string {
  if (file === undefined || file.buffer.length === 0) {
    throw new InvalidBankReturnFileError("aucun fichier reçu");
  }
  return file.buffer.toString("utf8");
}

/**
 * Un champ de formulaire qui porte du JSON. Illisible, il est rendu tel quel :
 * la validation de forme (zod) le refusera en nommant le champ.
 */
export function jsonField(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}
