import type { LegalMention } from "@lfd/contracts";

/** Command : retirer un article du document d'une mention. */
export class RemoveLegalDocumentParagraphCommand {
  constructor(
    readonly mention: LegalMention,
    readonly paragraphId: string,
    /**
     * La révision que l'écran a lue : l'écriture lui est conditionnée (B2).
     * `undefined` = pas de contrôle, le temps que le back-office l'envoie.
     */
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
