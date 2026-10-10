import type { LegalDocumentParagraphPayload, LegalMention } from "@lfd/contracts";

/** Command : réécrire un article existant. L'identifiant survit à la réécriture. */
export class EditLegalDocumentParagraphCommand {
  constructor(
    readonly mention: LegalMention,
    readonly paragraphId: string,
    readonly prose: LegalDocumentParagraphPayload,
    /**
     * La révision que l'écran a lue : l'écriture lui est conditionnée (B2).
     * `undefined` = pas de contrôle, le temps que le back-office l'envoie.
     */
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
