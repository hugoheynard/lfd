import { Module } from "@nestjs/common";

import { DepartureDeliveryColors } from "./application/departure-delivery-colors.js";
import { GetSiteHandler } from "./application/get-site.handler.js";
import { GetSitePaletteHandler } from "./application/get-site-palette.handler.js";
import { ListSitesHandler } from "./application/list-sites.handler.js";
import { SetSiteColorsHandler } from "./application/set-site-colors.handler.js";
import { SetSiteRolesHandler } from "./application/set-site-roles.handler.js";
import { SiteReader } from "./domain/site.reader.js";
import { SiteRepository } from "./domain/site.repository.js";
import { SiteTablesReader } from "./domain/site-tables.reader.js";
import { SiteTablesRepository } from "./domain/site-tables.repository.js";
import { GenerateSiteTableQrHandler } from "./application/generate-site-table-qr.handler.js";
import { GetSiteTablesHandler } from "./application/get-site-tables.handler.js";
import { RemoveSiteTableQrHandler } from "./application/remove-site-table-qr.handler.js";
import { SetSiteTableCountHandler } from "./application/set-site-table-count.handler.js";
import { AdminSiteTablesController } from "./http/admin-site-tables.controller.js";
import { AdminSitesController } from "./http/admin-sites.controller.js";
import { PrismaSiteReader } from "./infrastructure/prisma-site.reader.js";
import { PrismaSiteRepository } from "./infrastructure/prisma-site.repository.js";
import { PrismaSiteTablesReader } from "./infrastructure/prisma-site-tables.reader.js";
import { PrismaSiteTablesRepository } from "./infrastructure/prisma-site-tables.repository.js";

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
 *
 * La grille de tables (plan `documentation/sites/plan-sur-place-capacite-de-site.md`,
 * L2) a ses deux ports à elle, et n'est pas exportée : personne d'autre ne la lit.
 */
@Module({
  controllers: [AdminSitesController, AdminSiteTablesController],
  providers: [
    { provide: SiteRepository, useClass: PrismaSiteRepository },
    { provide: SiteReader, useClass: PrismaSiteReader },
    { provide: SiteTablesRepository, useClass: PrismaSiteTablesRepository },
    { provide: SiteTablesReader, useClass: PrismaSiteTablesReader },
    ListSitesHandler,
    GetSiteHandler,
    GetSitePaletteHandler,
    SetSiteRolesHandler,
    SetSiteColorsHandler,
    GetSiteTablesHandler,
    SetSiteTableCountHandler,
    GenerateSiteTableQrHandler,
    RemoveSiteTableQrHandler,
    DepartureDeliveryColors,
  ],
  exports: [SiteRepository, SiteReader, DepartureDeliveryColors],
})
export class SitesModule {}
