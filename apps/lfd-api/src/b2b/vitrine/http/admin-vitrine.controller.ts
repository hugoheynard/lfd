import {
  createVitrineSubscriberPayloadSchema,
  setVitrineContentsPayloadSchema,
  setVitrineSubscriberActivePayloadSchema,
  type CreateVitrineSubscriberPayload,
  type SetVitrineContentsPayload,
  type SetVitrineSubscriberActivePayload,
  type VitrineCredentialsView,
  type VitrineDeliveryView,
  type VitrineSubscriberView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreateVitrineSubscriberCommand } from "../application/commands/create-vitrine-subscriber.command.js";
import { ResendVitrineDeliveryCommand } from "../application/commands/resend-vitrine-delivery.command.js";
import { ResyncVitrineSubscriberCommand } from "../application/commands/resync-vitrine-subscriber.command.js";
import { RotateVitrineCredentialsCommand } from "../application/commands/rotate-vitrine-credentials.command.js";
import { SendVitrineTestCommand } from "../application/commands/send-vitrine-test.command.js";
import { SetVitrineContentsCommand } from "../application/commands/set-vitrine-contents.command.js";
import { SetVitrineSubscriberActiveCommand } from "../application/commands/set-vitrine-subscriber-active.command.js";
import { ListVitrineDeliveriesQuery } from "../application/queries/list-vitrine-deliveries.query.js";
import { ListVitrineSubscribersQuery } from "../application/queries/list-vitrine-subscribers.query.js";

/**
 * **Les abonnés du webhook de la vitrine** au back-office, Gestion Boutique
 * (plan vitrine, décision 3 du §5), sous `shop_vitrine` : lire en `GET`,
 * écrire sinon. Le secret et la clé ne sortent qu'à la création et à la
 * rotation — aucune lecture ne les rend.
 */
@Controller("admin/vitrine")
@AdminSurface("shop_vitrine")
export class AdminVitrineController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get("subscribers")
  list(): Promise<readonly VitrineSubscriberView[]> {
    return this.queries.execute<ListVitrineSubscribersQuery, readonly VitrineSubscriberView[]>(
      new ListVitrineSubscribersQuery(),
    );
  }

  @Post("subscribers")
  create(
    @Body(new ZodBody(createVitrineSubscriberPayloadSchema)) body: CreateVitrineSubscriberPayload,
  ): Promise<VitrineCredentialsView> {
    return this.commands.execute<CreateVitrineSubscriberCommand, VitrineCredentialsView>(
      new CreateVitrineSubscriberCommand(body.name, body.endpointUrl, body.contents),
    );
  }

  @Put("subscribers/:id/contents")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setContents(
    @Param("id") id: string,
    @Body(new ZodBody(setVitrineContentsPayloadSchema)) body: SetVitrineContentsPayload,
  ): Promise<void> {
    await this.commands.execute<SetVitrineContentsCommand, void>(
      new SetVitrineContentsCommand(id, body.contents),
    );
  }

  @Put("subscribers/:id/active")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setActive(
    @Param("id") id: string,
    @Body(new ZodBody(setVitrineSubscriberActivePayloadSchema))
    body: SetVitrineSubscriberActivePayload,
  ): Promise<void> {
    await this.commands.execute<SetVitrineSubscriberActiveCommand, void>(
      new SetVitrineSubscriberActiveCommand(id, body.active),
    );
  }

  @Post("subscribers/:id/rotate")
  @HttpCode(HttpStatus.OK)
  rotate(@Param("id") id: string): Promise<VitrineCredentialsView> {
    return this.commands.execute<RotateVitrineCredentialsCommand, VitrineCredentialsView>(
      new RotateVitrineCredentialsCommand(id),
    );
  }

  @Post("subscribers/:id/resync")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resync(@Param("id") id: string): Promise<void> {
    await this.commands.execute<ResyncVitrineSubscriberCommand, void>(
      new ResyncVitrineSubscriberCommand(id),
    );
  }

  @Post("subscribers/:id/test")
  async test(@Param("id") id: string): Promise<{ readonly id: string }> {
    const deliveryId = await this.commands.execute<SendVitrineTestCommand, string>(
      new SendVitrineTestCommand(id),
    );
    return { id: deliveryId };
  }

  @Get("subscribers/:id/deliveries")
  deliveries(@Param("id") id: string): Promise<readonly VitrineDeliveryView[]> {
    return this.queries.execute<ListVitrineDeliveriesQuery, readonly VitrineDeliveryView[]>(
      new ListVitrineDeliveriesQuery(id),
    );
  }

  @Post("deliveries/:id/resend")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resend(@Param("id") id: string): Promise<void> {
    await this.commands.execute<ResendVitrineDeliveryCommand, void>(
      new ResendVitrineDeliveryCommand(id),
    );
  }
}
