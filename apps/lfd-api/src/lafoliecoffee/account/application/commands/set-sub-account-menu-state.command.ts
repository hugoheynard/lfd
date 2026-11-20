import type { SiteMenuState } from "../../domain/value-objects/sub-account-menu-terms.js";

/**
 * Un site suit la carte commune de son principal, ou reprend sa carte propre
 * — depuis le principal (`carte-des-sites.md`, § 6.1, § 6.4), avec le même
 * droit que la carte du site (§ 3.2). Un état visé : déjà atteint, rien.
 */
export class SetSubAccountMenuStateCommand {
  constructor(
    readonly userId: string,
    readonly subAccountId: string,
    readonly state: SiteMenuState,
  ) {}
}
