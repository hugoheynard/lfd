import {
  type EnterPackedResupplyLine,
  enterPackedResupplyLineSchema,
  type PackingResuppliesView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { ClosePackingResupplyCommand } from "../application/resupplies/close-packing-resupply.command.js";
import { EnterPackedResupplyLineCommand } from "../application/resupplies/enter-packed-resupply-line.command.js";
import { ListPackingResuppliesQuery } from "../application/resupplies/list-packing-resupplies.query.js";
import { packingDayOf } from "./packing-day-path.js";
import { Idempotent } from "../../platform/shared/http/idempotent.decorator.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit la liste. */
const NO_CONTENT = 204;

/**
 * **Les fiches de réassort au poste de colisage** (réassort, lot R3b,
 * `reassort-boutiques/README.md`) — routes minimales,
 * l'écran vient en R3d.
 *
 * - `GET …/resupplies` — les fiches du jour ;
 * - `PUT …/resupplies/:resupplyId/lines/:sku` — la quantité emballée ;
 * - `POST …/resupplies/:resupplyId/close` — clore la fiche.
 *
 * Sous `production_packing`, le droit du poste : aucun droit neuf. Il
 * n'injecte que des bus.
 */
@Controller("admin/packing/:date/resupplies")
@AdminSurface("production_packing")
export class PackingResuppliesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(@Param("date") date: string): Promise<PackingResuppliesView> {
    return this.queries.execute<ListPackingResuppliesQuery, PackingResuppliesView>(
      new ListPackingResuppliesQuery(packingDayOf(date)),
    );
  }

  @Put(":resupplyId/lines/:sku")
  @Idempotent(
    "pose une quantité emballée : rejouée, l'écart avec la valeur déjà posée est nul et le stock ne bouge pas",
  )
  @HttpCode(NO_CONTENT)
  async enter(
    @Param("date") date: string,
    @Param("resupplyId") resupplyId: string,
    @Param("sku") sku: string,
    @Body(new ZodBody(enterPackedResupplyLineSchema)) body: EnterPackedResupplyLine,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<EnterPackedResupplyLineCommand, void>(
      new EnterPackedResupplyLineCommand(
        packingDayOf(date),
        resupplyId,
        sku,
        body.quantity,
        staffUserId,
      ),
    );
  }

  @Post(":resupplyId/close")
  @Idempotent(
    "transition : rejouée sur un réassort clos, l'agrégat rend faux et ni l'écriture ni la levée des réservations ne partent",
  )
  @HttpCode(NO_CONTENT)
  async close(
    @Param("date") date: string,
    @Param("resupplyId") resupplyId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ClosePackingResupplyCommand, void>(
      new ClosePackingResupplyCommand(packingDayOf(date), resupplyId, staffUserId),
    );
  }
}
