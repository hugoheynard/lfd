import { EVENT_FUNCTION_SHEET_FIELD, EVENT_FUNCTION_SHEET_MAX_BYTES } from "@lfd/contracts";
import type { NestInterceptor, Type } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

/**
 * **Backstop DoS : le double de la borne métier.** Multer coupe au-delà sans
 * lire le reste (413) ; en deçà, c'est `FunctionSheetPdf` qui refuse, avec un
 * message qui dit quoi faire.
 */
const FUNCTION_SHEET_UPLOAD_HARD_LIMIT = 2 * EVENT_FUNCTION_SHEET_MAX_BYTES;

/** Le peu qu'on lit du fichier Multer — le domaine valide le reste. */
export interface UploadedFunctionSheet {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
}

export function functionSheetUpload(): Type<NestInterceptor> {
  return FileInterceptor(EVENT_FUNCTION_SHEET_FIELD, {
    limits: { fileSize: FUNCTION_SHEET_UPLOAD_HARD_LIMIT },
  });
}
