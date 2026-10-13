import type { SiteColorsPayload } from "@lfd/contracts";

/** Commande **staff** : enregistrer en bloc les quatre couleurs d'un site. */
export class SetSiteColorsCommand {
  constructor(
    readonly siteId: string,
    readonly payload: SiteColorsPayload,
  ) {}
}
