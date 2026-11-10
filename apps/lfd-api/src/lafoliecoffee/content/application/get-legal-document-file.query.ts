import type { SalesTermsDocument } from "@lfd/contracts";

/**
 * Query : les octets d'un PDF de référence — celui en vigueur (`fileId`
 * `null`), ou un dépôt précis de l'historique.
 */
export class GetLegalDocumentFileQuery {
  constructor(
    readonly document: SalesTermsDocument,
    readonly fileId: string | null,
  ) {}
}

/** Ce que le contrôleur sert : les octets, et le nom daté du fichier. */
export interface LegalDocumentFileDownload {
  readonly bytes: Buffer;
  readonly fileName: string;
}
