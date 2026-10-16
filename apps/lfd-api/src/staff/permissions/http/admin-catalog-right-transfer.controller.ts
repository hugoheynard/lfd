import type { CatalogRightTransferView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetCatalogRightTransferQuery } from "../application/get-catalog-right-transfer.query.js";

/**
 * **L'aperçu du transfert du droit du catalogue** —
 * `GET /admin/staff-access/catalog-right-transfer`
 * (`documentation/droits-et-permissions/plan-droit-lfc-catalog.md`, C2).
 *
 * Sous `staff_access:read` : qui règle les rôles voit ce qu'il reste à
 * recopier. Lecture seule, et délibérément : pas de geste « tout recopier »,
 * un bouton qui écrit des droits en masse est ce que la règle refuse aux
 * migrations.
 */
@Controller("admin/staff-access")
@AdminSurface("staff_access")
export class AdminCatalogRightTransferController {
  constructor(private readonly queries: QueryBus) {}

  @Get("catalog-right-transfer")
  get(): Promise<CatalogRightTransferView> {
    return this.queries.execute<GetCatalogRightTransferQuery, CatalogRightTransferView>(
      new GetCatalogRightTransferQuery(),
    );
  }
}
