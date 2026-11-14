import type { CompanyContactMode } from "@lfd/contracts";

/**
 * Noter un échange avec une société — acte **staff** sur la fiche, sans mur
 * membership : `AdminAuthGuard` porte l'autorisation en amont. L'auteur est
 * l'acteur de la requête, lu par le journal ; `staffUserId` sert au sceau de
 * l'intention.
 */
export class NoteCompanyContactCommand {
  constructor(
    readonly companyId: string,
    readonly mode: CompanyContactMode,
    /** Le jour de l'échange, `AAAA-MM-JJ`. */
    readonly date: string,
    /** Une note courte ; absente ou blanche, aucune note n'est gardée. */
    readonly note: string | undefined,
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne note pas deux fois. */
    readonly intentKey: string,
  ) {}
}
