import type { ProductionPackingView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { GetPackingBoardQuery } from "../application/board/get-packing-board.query.js";
import { packingDayOf } from "./packing-day-path.js";

/**
 * **Le poste de colisage, servi par le colisage** (plan
 * `colisage/plan-domaine-colisage.md`, §17, K3a).
 *
 * `GET admin/packing/:date/board` rend la même forme que
 * `GET admin/production/packing?date=` (`ProductionPackingView`), que le
 * fournil sert encore jusqu'à K3c : l'écran change d'adresse, pas de contrat.
 *
 * Sous `production_packing` (`read`) : le droit de qui tient le poste. Aucun
 * droit neuf, aucun rôle touché. Il n'injecte que le `QueryBus`.
 */
@Controller("admin/packing/:date")
@AdminSurface("production_packing")
export class PackingBoardController {
  constructor(private readonly queries: QueryBus) {}

  @Get("board")
  board(@Param("date") date: string): Promise<ProductionPackingView> {
    return this.queries.execute<GetPackingBoardQuery, ProductionPackingView>(
      new GetPackingBoardQuery(packingDayOf(date)),
    );
  }
}
