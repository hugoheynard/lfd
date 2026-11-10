import {
  salesTermsDocumentSchema,
  salesTermsDocuments,
  type SalesTermsDocument,
} from "@lfd/contracts";
import type { PipeTransform } from "@nestjs/common";

import { UnknownLegalMentionError } from "../domain/errors/legal-document-errors.js";

/**
 * Valide le segment `:mention` des routes du PDF de référence : seuls les
 * deux textes de CGV en portent un (plan `legal/plan-cgv-par-audience.md`,
 * C3). Une autre mention rend **404**, comme une mention inconnue — le PDF
 * qu'on demande n'existe pas.
 */
export class SalesTermsDocumentParam implements PipeTransform<string, SalesTermsDocument> {
  transform(value: string): SalesTermsDocument {
    const parsed = salesTermsDocumentSchema.safeParse(value);
    if (!parsed.success) {
      throw new UnknownLegalMentionError(value, salesTermsDocuments);
    }
    return parsed.data;
  }
}
