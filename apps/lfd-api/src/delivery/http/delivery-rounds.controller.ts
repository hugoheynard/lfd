import {
  type AssignDeliveryStopPayload,
  assignDeliveryStopPayloadSchema,
  type CreatedIdResponse,
  type DeliveryRoundsDayView,
  type MoveDeliveryStopPayload,
  moveDeliveryStopPayloadSchema,
  type OpenDeliveryRoundPayload,
  openDeliveryRoundPayloadSchema,
  type RemoveDeliveryStopPayload,
  removeDeliveryStopPayloadSchema,
  type ReorderDeliveryRoundPayload,
  reorderDeliveryRoundPayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { AssignDeliveryStopCommand } from "../application/commands/assign-delivery-stop.command.js";
import { MoveDeliveryStopCommand } from "../application/commands/move-delivery-stop.command.js";
import { OpenDeliveryRoundCommand } from "../application/commands/open-delivery-round.command.js";
import { RemoveDeliveryStopCommand } from "../application/commands/remove-delivery-stop.command.js";
import { ReorderDeliveryRoundCommand } from "../application/commands/reorder-delivery-round.command.js";
import { GetDeliveryRoundsDayQuery } from "../application/queries/get-delivery-rounds-day.query.js";

/** Le jour de service, validé dans sa FORME — le message nomme le paramètre. */
const dayQuerySchema = z.object({
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ"),
});
type DayQuery = z.infer<typeof dayQuerySchema>;

/** Ce que rend une affectation : l'arrêt créé, pour le réordonner ensuite. */
interface AssignedStopResponse {
  readonly stopId: string;
}

/**
 * **Composer les tournées** — Livraison → Tournées
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 3).
 *
 * Sous `delivery_rounds` : lecture et écriture pour `admin` et `comptoir`
 * (Q12). Chaque geste est un verbe nommé et porte la version lue ; une
 * composition changée entre-temps répond 409 « rechargez ». Il n'injecte que
 * les bus.
 */
@Controller("admin/livraison/tournees")
@AdminSurface("delivery_rounds")
export class DeliveryRoundsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  day(@Query(new ZodQuery(dayQuerySchema)) query: DayQuery): Promise<DeliveryRoundsDayView> {
    return this.queries.execute<GetDeliveryRoundsDayQuery, DeliveryRoundsDayView>(
      new GetDeliveryRoundsDayQuery(query.jour),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async open(
    @Body(new ZodBody(openDeliveryRoundPayloadSchema)) payload: OpenDeliveryRoundPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<OpenDeliveryRoundCommand, string>(
      new OpenDeliveryRoundCommand(payload),
    );
    return { id };
  }

  @Post(":roundId/arrets")
  @HttpCode(HttpStatus.CREATED)
  async assign(
    @Param("roundId") roundId: string,
    @Body(new ZodBody(assignDeliveryStopPayloadSchema)) payload: AssignDeliveryStopPayload,
  ): Promise<AssignedStopResponse> {
    const stopId = await this.commands.execute<AssignDeliveryStopCommand, string>(
      new AssignDeliveryStopCommand(roundId, payload),
    );
    return { stopId };
  }

  @Post(":roundId/arrets/:stopId/deplacement")
  @HttpCode(HttpStatus.NO_CONTENT)
  async move(
    @Param("roundId") roundId: string,
    @Param("stopId") stopId: string,
    @Body(new ZodBody(moveDeliveryStopPayloadSchema)) payload: MoveDeliveryStopPayload,
  ): Promise<void> {
    await this.commands.execute<MoveDeliveryStopCommand, void>(
      new MoveDeliveryStopCommand(roundId, stopId, payload),
    );
  }

  @Put(":roundId/ordre")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @Param("roundId") roundId: string,
    @Body(new ZodBody(reorderDeliveryRoundPayloadSchema)) payload: ReorderDeliveryRoundPayload,
  ): Promise<void> {
    await this.commands.execute<ReorderDeliveryRoundCommand, void>(
      new ReorderDeliveryRoundCommand(roundId, payload),
    );
  }

  @Post(":roundId/arrets/:stopId/retrait")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("roundId") roundId: string,
    @Param("stopId") stopId: string,
    @Body(new ZodBody(removeDeliveryStopPayloadSchema)) payload: RemoveDeliveryStopPayload,
  ): Promise<void> {
    await this.commands.execute<RemoveDeliveryStopCommand, void>(
      new RemoveDeliveryStopCommand(roundId, stopId, payload),
    );
  }
}
