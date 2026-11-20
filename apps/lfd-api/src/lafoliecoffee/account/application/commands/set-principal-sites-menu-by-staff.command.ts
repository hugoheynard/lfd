import type { RequestedMenu } from "../../domain/services/whole-menu.js";

/**
 * Pose la carte commune ENTIÈRE des sites d'un principal, depuis sa fiche
 * client. Acte **staff** (`b2b_companies`, en écriture). Le geste prévient le
 * principal par e-mail : il porte la clé d'intention de l'écran.
 */
export class SetPrincipalSitesMenuByStaffCommand {
  constructor(
    readonly companyId: string,
    /** L'id de fiche du staff : l'auteur de la carte. */
    readonly staffUserId: string,
    readonly menu: RequestedMenu,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`). */
    readonly intentKey: string,
  ) {}
}
