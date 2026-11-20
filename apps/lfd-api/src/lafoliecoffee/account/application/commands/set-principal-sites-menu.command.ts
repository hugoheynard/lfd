import type { RequestedMenu } from "../../domain/services/whole-menu.js";

/**
 * Pose la carte commune ENTIÈRE des sites d'un principal, depuis ce principal
 * (`carte-des-sites.md`, § 6.1) : son propriétaire ou un administrateur
 * accepté, principal actif.
 */
export class SetPrincipalSitesMenuCommand {
  constructor(
    readonly userId: string,
    readonly principalId: string,
    readonly menu: RequestedMenu,
  ) {}
}
