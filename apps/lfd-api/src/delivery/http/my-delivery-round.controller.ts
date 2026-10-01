import {
  type DepartDeliveryRoundPayload,
  departDeliveryRoundPayloadSchema,
  type MyDeliveryRoundsView,
  type MyDeliveryRoundView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { DepartMyRoundCommand } from "../application/commands/depart-my-round.command.js";
import { GetMyDeliveryRoundQuery } from "../application/queries/get-my-delivery-round.query.js";
import { GetMyDeliveryRoundsQuery } from "../application/queries/get-my-delivery-rounds.query.js";

/** Le jour, validé dans sa FORME — le message nomme le paramètre. */
const dateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
});
type DateQuery = z.infer<typeof dateQuerySchema>;

/**
 * **« Ma tournée » — la page du livreur** (`documentation/livraisons/plan-ma-tournee.md`,
 * MT-D4).
 *
 * Sous `delivery_driving` : lire SA tournée et la commencer. Le livreur n'est
 * jamais un paramètre d'URL — c'est la fiche de la requête (`@StaffUserId`),
 * et elle entre dans le `where` de chaque lecture et du verrou du départ
 * (MT-D3). Une tournée d'un autre rend 404, pas 403 : on ne confirme pas
 * qu'elle existe. L'admin, qui tient le droit, n'y voit que les tournées où
 * il est lui-même affecté — le mur ne connaît pas d'exception de rôle.
 *
 * La porte du chargeur (`tournees/:roundId/depart`, sous `delivery_loading`)
 * reste en service, inchangée (MT-Q5). Il n'injecte que les bus.
 */
@Controller("admin/livraison/ma-tournee")
@AdminSurface("delivery_driving")
export class MyDeliveryRoundController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  mine(
    @StaffUserId() staffUserId: string,
    @Query(new ZodQuery(dateQuerySchema)) query: DateQuery,
  ): Promise<MyDeliveryRoundsView> {
    return this.queries.execute<GetMyDeliveryRoundsQuery, MyDeliveryRoundsView>(
      new GetMyDeliveryRoundsQuery(staffUserId, query.date),
    );
  }

  @Get(":roundId")
  round(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
  ): Promise<MyDeliveryRoundView> {
    return this.queries.execute<GetMyDeliveryRoundQuery, MyDeliveryRoundView>(
      new GetMyDeliveryRoundQuery(staffUserId, roundId),
    );
  }

  @Post(":roundId/depart")
  @HttpCode(HttpStatus.NO_CONTENT)
  async depart(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
    @Body(new ZodBody(departDeliveryRoundPayloadSchema)) payload: DepartDeliveryRoundPayload,
  ): Promise<void> {
    await this.commands.execute<DepartMyRoundCommand, void>(
      new DepartMyRoundCommand(staffUserId, roundId, payload),
    );
  }
}
