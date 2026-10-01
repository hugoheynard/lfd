import {
  type DeliveryLoadingPlanView,
  type DeliveryLoadingRoundView,
  type LoadDeliveryBinPayload,
  loadDeliveryBinPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { LoadMyBinCommand } from "../application/commands/load-my-bin.command.js";
import { UnloadMyBinCommand } from "../application/commands/unload-my-bin.command.js";
import { GetMyLoadingPlanQuery } from "../application/queries/get-my-loading-plan.query.js";
import { GetMyLoadingRoundQuery } from "../application/queries/get-my-loading-round.query.js";

/**
 * **Charger depuis « Ma tournée »** (`documentation/livraisons/parcours-du-livreur.md`,
 * PL1) — le scan et le plan de chargement de SA tournée.
 *
 * Sous `delivery_driving` (lire : `read`, charger et décharger : `write`), le
 * mur du livreur dans chaque lecture et chaque geste : une tournée d'un autre
 * rend 404. Mêmes vues et mêmes corps que l'écran de chargement
 * (`DeliveryLoadingController`, sous `delivery_loading`, qui ne change pas) :
 * chaque route passe par une commande « à moi » qui pose le mur puis exécute
 * la commande ou la lecture du chargement. Partir reste la route
 * `ma-tournee/:roundId/depart`. Il n'injecte que les bus.
 */
@Controller("admin/livraison/ma-tournee")
@AdminSurface("delivery_driving")
export class MyDeliveryLoadingController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(":roundId/chargement")
  round(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
  ): Promise<DeliveryLoadingRoundView> {
    return this.queries.execute<GetMyLoadingRoundQuery, DeliveryLoadingRoundView>(
      new GetMyLoadingRoundQuery(staffUserId, roundId),
    );
  }

  @Get(":roundId/chargement/plan")
  plan(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
  ): Promise<DeliveryLoadingPlanView> {
    return this.queries.execute<GetMyLoadingPlanQuery, DeliveryLoadingPlanView>(
      new GetMyLoadingPlanQuery(staffUserId, roundId),
    );
  }

  @Post(":roundId/chargement/bacs")
  @HttpCode(HttpStatus.NO_CONTENT)
  async load(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
    @Body(new ZodBody(loadDeliveryBinPayloadSchema)) payload: LoadDeliveryBinPayload,
  ): Promise<void> {
    await this.commands.execute<LoadMyBinCommand, void>(
      new LoadMyBinCommand(staffUserId, roundId, payload),
    );
  }

  @Post(":roundId/chargement/bacs/:binId/dechargement")
  @HttpCode(HttpStatus.NO_CONTENT)
  async unload(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
    @Param("binId") binId: string,
  ): Promise<void> {
    await this.commands.execute<UnloadMyBinCommand, void>(
      new UnloadMyBinCommand(staffUserId, roundId, binId),
    );
  }
}
