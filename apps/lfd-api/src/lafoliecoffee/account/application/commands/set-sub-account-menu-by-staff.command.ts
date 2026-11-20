import type { RequestedMenu } from "../../domain/services/whole-menu.js";

/**
 * Pose la carte ENTIÈRE d'un sous-compte, depuis sa fiche client. Acte
 * **staff**, sans mur membership : la surface admin porte l'autorisation
 * (`b2b_companies`, en écriture).
 *
 * Le geste prévient le principal par e-mail (`carte-des-sites.md`, Q3) :
 * il porte donc la clé d'intention de l'écran, et un second clic de même clé
 * ne réexécute rien.
 */
export class SetSubAccountMenuByStaffCommand {
  constructor(
    readonly companyId: string,
    /** L'id de fiche du staff : l'auteur de la carte. */
    readonly staffUserId: string,
    readonly menu: RequestedMenu,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`). */
    readonly intentKey: string,
  ) {}
}
