import type { SiteRolesPayload } from "@lfd/contracts";

/** Commande **staff** : enregistrer en bloc les rôles d'un site. */
export class SetSiteRolesCommand {
  constructor(
    readonly siteId: string,
    readonly payload: SiteRolesPayload,
  ) {}
}
