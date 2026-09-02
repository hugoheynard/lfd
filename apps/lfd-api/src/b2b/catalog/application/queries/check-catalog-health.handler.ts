import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { CatalogHealthView } from "@lfd/contracts";

import { CheckCatalogHealthService } from "../check-catalog-health.service.js";
import { CheckCatalogHealthQuery } from "./check-catalog-health.query.js";

@QueryHandler(CheckCatalogHealthQuery)
export class CheckCatalogHealthHandler implements IQueryHandler<
  CheckCatalogHealthQuery,
  CatalogHealthView
> {
  constructor(private readonly health: CheckCatalogHealthService) {}

  execute(): Promise<CatalogHealthView> {
    return this.health.check();
  }
}
