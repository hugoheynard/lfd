import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CheckCatalogParityService } from "../check-catalog-parity.service.js";
import type { ParityReport } from "../../domain/catalog-parity.js";
import { CheckCatalogParityQuery } from "./check-catalog-parity.query.js";

@QueryHandler(CheckCatalogParityQuery)
export class CheckCatalogParityHandler implements IQueryHandler<
  CheckCatalogParityQuery,
  ParityReport
> {
  constructor(private readonly parity: CheckCatalogParityService) {}

  execute(): Promise<ParityReport> {
    return this.parity.check();
  }
}
