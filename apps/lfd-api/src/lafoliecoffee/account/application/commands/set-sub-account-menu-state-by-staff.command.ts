import type { SiteMenuState } from "../../domain/value-objects/sub-account-menu-terms.js";

/**
 * La même bascule, depuis la fiche client (`b2b_companies`, en écriture).
 * Elle change la carte du site, et le principal en est prévenu (Q3) : le
 * geste porte la clé d'intention de l'écran.
 */
export class SetSubAccountMenuStateByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly staffUserId: string,
    readonly state: SiteMenuState,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`). */
    readonly intentKey: string,
  ) {}
}
