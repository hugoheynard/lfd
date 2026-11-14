import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import {
  salesOversightQuerySchema,
  type SalesOversightQuery,
  type SalesOversightView,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetSalesOversightQuery } from "../application/queries/get-sales-oversight.query.js";

/**
 * **Le suivi commercial**, en lecture : une ligne par fiche principale, son
 * niveau de travail, ce qui lui manque et ses signaux
 * (`documentation/b2b/plan-suivi-commercial.md`, § 3.3). Une ressource à
 * elle, `b2b_sales_oversight` : la page montre le travail de chaque salarié,
 * et ne s'ouvre pas avec les comptes clients.
 */
@Controller("admin/sales-oversight")
@AdminSurface("b2b_sales_oversight")
export class AdminSalesOversightController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(
    @Query(new ZodQuery(salesOversightQuerySchema)) filters: SalesOversightQuery,
  ): Promise<SalesOversightView> {
    return this.queries.execute<GetSalesOversightQuery, SalesOversightView>(
      new GetSalesOversightQuery(filters),
    );
  }
}
