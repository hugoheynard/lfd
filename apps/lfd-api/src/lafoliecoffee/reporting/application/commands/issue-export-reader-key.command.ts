import type { IssueExportReaderKeyPayload } from "@lfd/contracts";

/**
 * Créer une clé de lecture de l'export des ventes. Rend son id et, cette
 * fois seulement, son secret en clair.
 */
export class IssueExportReaderKeyCommand {
  constructor(
    readonly payload: IssueExportReaderKeyPayload,
    /** La fiche du staff qui agit : l'auteur de la clé et l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne recrée pas de clé. */
    readonly intentKey: string,
  ) {}
}

/** Ce que la création rend : l'id, et le secret en clair, montré cette fois seulement. */
export interface IssuedExportReaderKey {
  readonly id: string;
  readonly secret: string;
}
