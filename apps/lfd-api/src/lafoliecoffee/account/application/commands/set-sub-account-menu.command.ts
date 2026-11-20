import type { RequestedMenu } from "../../domain/services/whole-menu.js";

/**
 * Pose la carte ENTIÈRE d'un sous-compte, depuis son compte principal
 * (`plan-carte-des-sites.md`, § 3.2) : le propriétaire ou un administrateur
 * du principal actif, jamais un membre du site.
 */
export class SetSubAccountMenuCommand {
  constructor(
    readonly userId: string,
    readonly subAccountId: string,
    readonly menu: RequestedMenu,
  ) {}
}
