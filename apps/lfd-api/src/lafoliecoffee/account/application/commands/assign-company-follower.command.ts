/**
 * Confier (ou retirer) le suivi commercial d'une fiche — acte **staff**, la
 * cheffe des commerciaux sous `b2b_sales_oversight:write`. Celui qui décide est
 * l'acteur de la requête, lu par le journal ; `staffUserId` sert au sceau de
 * l'intention.
 */
export class AssignCompanyFollowerCommand {
  constructor(
    readonly companyId: string,
    /** La personne qui suivra la fiche, ou `null` pour retirer le suiveur. */
    readonly followerStaffId: string | null,
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne journalise pas deux fois. */
    readonly intentKey: string,
  ) {}
}
