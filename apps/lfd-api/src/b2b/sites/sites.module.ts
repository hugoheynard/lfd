import { Module } from "@nestjs/common";

import { DepartureDeliveryColors } from "./application/departure-delivery-colors.js";
import { GetSiteHandler } from "./application/get-site.handler.js";
import { GetSitePaletteHandler } from "./application/get-site-palette.handler.js";
import { ListSitesHandler } from "./application/list-sites.handler.js";
import { SetSiteColorsHandler } from "./application/set-site-colors.handler.js";
import { SetSiteRolesHandler } from "./application/set-site-roles.handler.js";
import { SiteReader } from "./domain/site.reader.js";
import { SiteRepository } from "./domain/site.repository.js";
import { AdminSitesController } from "./http/admin-sites.controller.js";
import { PrismaSiteReader } from "./infrastructure/prisma-site.reader.js";
import { PrismaSiteRepository } from "./infrastructure/prisma-site.repository.js";

/**
 * **Les sites** — nos lieux, leurs rôles et leurs couleurs (doc
 * `documentation/sites/sites.md`,
 * lot S1). Deux ports, un par sens (ISP) : l'agrégat s'écrit par
 * `SiteRepository`, l'écran lit par `SiteReader`.
 *
 * Exporte les deux : les gestes historiques des points de retrait écrivent
 * désormais par l'agrégat, et la livraison lit ses candidats au départ. Et
 * `DepartureDeliveryColors` (plan du tri et des couleurs, L5) : la lecture
 * que les ports de couleur de la livraison et du retrait adaptent.
 */
@Module({
  controllers: [AdminSitesController],
  providers: [
    { provide: SiteRepository, useClass: PrismaSiteRepository },
    { provide: SiteReader, useClass: PrismaSiteReader },
    ListSitesHandler,
    GetSiteHandler,
    GetSitePaletteHandler,
    SetSiteRolesHandler,
    SetSiteColorsHandler,
    DepartureDeliveryColors,
  ],
  exports: [SiteRepository, SiteReader, DepartureDeliveryColors],
})
export class SitesModule {}
