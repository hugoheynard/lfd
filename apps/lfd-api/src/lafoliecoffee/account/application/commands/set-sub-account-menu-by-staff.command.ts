import type { RequestedMenu } from "../../domain/services/whole-menu.js";

/**
 * Pose la carte ENTIÈRE d'un sous-compte, depuis sa fiche client. Acte
 * **staff**, sans mur membership : la surface admin porte l'autorisation
 * (`b2b_companies`, en écriture).
 */
export class SetSubAccountMenuByStaffCommand {
  constructor(
    readonly companyId: string,
    /** L'id de fiche du staff : l'auteur de la carte. */
    readonly staffUserId: string,
    readonly menu: RequestedMenu,
  ) {}
}
