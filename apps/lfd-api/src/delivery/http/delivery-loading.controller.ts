import {
  type DeliveryLoadingDayView,
  type DeliveryLoadingPlanView,
  type DeliveryLoadingRoundView,
  type DepartDeliveryRoundPayload,
  departDeliveryRoundPayloadSchema,
  type LoadDeliveryBinPayload,
  loadDeliveryBinPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { DepartDeliveryRoundCommand } from "../application/commands/depart-delivery-round.command.js";
import { LoadDeliveryBinCommand } from "../application/commands/load-delivery-bin.command.js";
import { UnloadDeliveryBinCommand } from "../application/commands/unload-delivery-bin.command.js";
import { GetDeliveryLoadingPlanQuery } from "../application/queries/get-delivery-loading-plan.query.js";
import { GetDeliveryLoadingDayQuery } from "../application/queries/get-delivery-loading-day.query.js";
import { GetDeliveryLoadingRoundQuery } from "../application/queries/get-delivery-loading-round.query.js";

/** Le jour de service, validé dans sa FORME — le message nomme le paramètre. */
const dayQuerySchema = z.object({
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ"),
});
type DayQuery = z.infer<typeof dayQuerySchema>;

/**
 * **Le chargement, véhicule par véhicule** — charger, décharger, partir
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4, L4-C2,
 * L4-C4, Q14).
 *
 * Sous `delivery_loading` (Q21) — y compris « Partir », rangé sous
 * `/tournees/{id}/depart` parce que c'est la tournée qui part, mais qui est le
 * dernier geste du CHARGEMENT : composer n'ouvre pas le droit de partir. Il
 * n'injecte que les bus.
 */
@Controller("admin/livraison")
@AdminSurface("delivery_loading")
export class DeliveryLoadingController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get("chargement")
  day(@Query(new ZodQuery(dayQuerySchema)) query: DayQuery): Promise<DeliveryLoadingDayView> {
    return this.queries.execute<GetDeliveryLoadingDayQuery, DeliveryLoadingDayView>(
      new GetDeliveryLoadingDayQuery(query.jour),
    );
  }

  @Get("chargement/:roundId")
  round(@Param("roundId") roundId: string): Promise<DeliveryLoadingRoundView> {
    return this.queries.execute<GetDeliveryLoadingRoundQuery, DeliveryLoadingRoundView>(
      new GetDeliveryLoadingRoundQuery(roundId),
    );
  }

  /** Le plan de chargement (lot 4 bis, v2-5) : il suggère l'ordre de scan, sans l'imposer. */
  @Get("chargement/:roundId/plan")
  plan(@Param("roundId") roundId: string): Promise<DeliveryLoadingPlanView> {
    return this.queries.execute<GetDeliveryLoadingPlanQuery, DeliveryLoadingPlanView>(
      new GetDeliveryLoadingPlanQuery(roundId),
    );
  }

  @Post("chargement/:roundId/bacs")
  @HttpCode(HttpStatus.NO_CONTENT)
  async load(
    @Param("roundId") roundId: string,
    @Body(new ZodBody(loadDeliveryBinPayloadSchema)) payload: LoadDeliveryBinPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<LoadDeliveryBinCommand, void>(
      new LoadDeliveryBinCommand(roundId, payload, staffUserId),
    );
  }

  @Post("chargement/:roundId/bacs/:binId/dechargement")
  @HttpCode(HttpStatus.NO_CONTENT)
  async unload(@Param("roundId") roundId: string, @Param("binId") binId: string): Promise<void> {
    await this.commands.execute<UnloadDeliveryBinCommand, void>(
      new UnloadDeliveryBinCommand(roundId, binId),
    );
  }

  @Post("tournees/:roundId/depart")
  @HttpCode(HttpStatus.NO_CONTENT)
  async depart(
    @Param("roundId") roundId: string,
    @Body(new ZodBody(departDeliveryRoundPayloadSchema)) payload: DepartDeliveryRoundPayload,
  ): Promise<void> {
    await this.commands.execute<DepartDeliveryRoundCommand, void>(
      new DepartDeliveryRoundCommand(roundId, payload),
    );
  }
}
