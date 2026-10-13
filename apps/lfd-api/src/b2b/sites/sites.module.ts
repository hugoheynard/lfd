import { Module } from "@nestjs/common";

import { GetSiteHandler } from "./application/get-site.handler.js";
import { ListSitesHandler } from "./application/list-sites.handler.js";
import { SetSiteColorsHandler } from "./application/set-site-colors.handler.js";
import { SetSiteRolesHandler } from "./application/set-site-roles.handler.js";
import { SiteReader } from "./domain/site.reader.js";
import { SiteRepository } from "./domain/site.repository.js";
import { AdminSitesController } from "./http/admin-sites.controller.js";
import { PrismaSiteReader } from "./infrastructure/prisma-site.reader.js";
import { PrismaSiteRepository } from "./infrastructure/prisma-site.repository.js";

/**
 * **Les sites** — nos lieux, leurs rôles et leurs couleurs (plan
 * `documentation/livraisons/transferts/plan-sites-transfert-interne-tri-et-couleurs.md`,
 * lot S1). Deux ports, un par sens (ISP) : l'agrégat s'écrit par
 * `SiteRepository`, l'écran lit par `SiteReader`.
 *
 * Exporte les deux : les gestes historiques des points de retrait écrivent
 * désormais par l'agrégat, et la livraison lit ses candidats au départ.
 */
@Module({
  controllers: [AdminSitesController],
  providers: [
    { provide: SiteRepository, useClass: PrismaSiteRepository },
    { provide: SiteReader, useClass: PrismaSiteReader },
    ListSitesHandler,
    GetSiteHandler,
    SetSiteRolesHandler,
    SetSiteColorsHandler,
  ],
  exports: [SiteRepository, SiteReader],
})
export class SitesModule {}
