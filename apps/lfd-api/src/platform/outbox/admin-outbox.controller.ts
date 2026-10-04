import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../auth/admin-surface.decorator.js";
import { ZodBody } from "../shared/http/zod-body.pipe.js";
import { ReplayOutboxDeliveryCommand } from "./replay-outbox-delivery.command.js";

const ReplaySchema = z.object({
  eventId: z.string().min(1),
  subscriber: z.string().min(1),
});
type ReplayBody = z.infer<typeof ReplaySchema>;

/**
 * Le rejeu manuel d'une lettre morte (plan §8) — route seule en BE1, l'écran
 * viendra avec la carte de santé. Sous `ops_health` : c'est la surface qui
 * montrera les lettres mortes, et le POST exige son droit d'écriture.
 */
@Controller("admin/outbox/replay")
@AdminSurface("ops_health")
export class AdminOutboxController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(204)
  async replay(@Body(new ZodBody(ReplaySchema)) body: ReplayBody): Promise<void> {
    await this.commands.execute<ReplayOutboxDeliveryCommand, void>(
      new ReplayOutboxDeliveryCommand(body.eventId, body.subscriber),
    );
  }
}
