import type { ProductionPackingView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { GetPackingBoardQuery } from "../application/board/get-packing-board.query.js";
import { packingDayOf } from "./packing-day-path.js";

/**
 * **Le poste de colisage, servi par le colisage** (plan
 * `colisage/colisage.md`, §17, K3a).
 *
 * `GET admin/packing/:date/board` rend `ProductionPackingView`, la forme que
 * servait le poste du fournil (retiré en K3c).
 *
 * Sous `production_packing:read` (qui tient le poste) **ou**
 * `b2b_supervision:read` : la colonne colisage de la Supervision lit ce même
 * board, sans recevoir le poste en écriture (plan, §17.6). Aucun droit neuf,
 * aucun rôle touché. Il n'injecte que le `QueryBus`.
 */
@Controller("admin/packing/:date")
@AdminSurface("production_packing")
export class PackingBoardController {
  constructor(private readonly queries: QueryBus) {}

  @Get("board")
  @RequireAnyPermission("production_packing:read", "b2b_supervision:read")
  board(@Param("date") date: string): Promise<ProductionPackingView> {
    return this.queries.execute<GetPackingBoardQuery, ProductionPackingView>(
      new GetPackingBoardQuery(packingDayOf(date)),
    );
  }
}
