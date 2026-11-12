import {
  type CatalogScreenRowsQuery,
  catalogScreenRowsQuerySchema,
  type CatalogScreenRowsView,
  type CatalogScreenView,
  type StaffPermission,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffPermissions } from "../../../platform/auth/staff.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetCatalogScreenRowsQuery } from "../application/queries/get-catalog-screen-rows.query.js";
import { GetCatalogScreenQuery } from "../application/queries/get-catalog-screen.query.js";

/**
 * **L'écran Catalogue du back-office, lu une fois**
 * (`documentation/caching-usage/le-cache-du-back-office.md`, § 4.1–4.2) :
 * `GET admin/catalog/screen` rend tout l'écran, `GET admin/catalog/screen/rows`
 * les lignes qu'un geste a touchées. Les deux rendent le numéro
 * `catalog-admin` lu avant les données.
 *
 * Sous `@AdminSurface("lfc_catalog")`, le droit de l'écran ; les marqueurs du
 * sur mesure se tranchent dans le handler par les permissions de l'appelant.
 * Un contrôleur à part de `AdminCatalogController` : les routes de celui-ci
 * restent servies à d'autres écrans.
 */
@Controller("admin/catalog/screen")
@AdminSurface("lfc_catalog")
export class AdminCatalogScreenController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  screen(@StaffPermissions() permissions: readonly StaffPermission[]): Promise<CatalogScreenView> {
    return this.queries.execute<GetCatalogScreenQuery, CatalogScreenView>(
      new GetCatalogScreenQuery(permissions),
    );
  }

  /** `?sku=A,B` — les fiches de ces articles, entières. */
  @Get("rows")
  rows(
    @Query(new ZodQuery(catalogScreenRowsQuerySchema)) query: CatalogScreenRowsQuery,
  ): Promise<CatalogScreenRowsView> {
    return this.queries.execute<GetCatalogScreenRowsQuery, CatalogScreenRowsView>(
      new GetCatalogScreenRowsQuery(query.sku),
    );
  }
}
