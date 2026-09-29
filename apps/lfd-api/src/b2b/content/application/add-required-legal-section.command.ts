import type { LegalDocumentParagraphPayload, LegalMention, LegalSectionKey } from "@lfd/contracts";

/**
 * Command : créer la **section requise** d'un document, avec le texte que le
 * rédacteur a saisi (plan `legal/plan-page-confidentialite.md` §4.2, §4.5 S3 —
 * aucun texte de départ).
 */
export class AddRequiredLegalSectionCommand {
  constructor(
    readonly mention: LegalMention,
    readonly section: LegalSectionKey,
    readonly prose: LegalDocumentParagraphPayload,
    /** La révision que l'écran a lue : l'écriture lui est conditionnée (B2). */
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
