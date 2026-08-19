import {
  createSubscriptionPayloadSchema,
  occurrenceDateSchema,
  setSubscriptionStatusPayloadSchema,
  upsertOccurrenceOverridePayloadSchema,
  type CreateSubscriptionPayload,
  type SetSubscriptionStatusPayload,
  type SubscriptionView,
  type UpsertOccurrenceOverridePayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreateSubscriptionCommand } from "../application/commands/create-subscription.command.js";
import { DeleteSubscriptionCommand } from "../application/commands/delete-subscription.command.js";
import { SetSubscriptionStatusCommand } from "../application/commands/set-subscription-status.command.js";
import { UpsertOccurrenceOverrideCommand } from "../application/commands/upsert-occurrence-override.command.js";
import type { CreatedSubscription } from "../domain/ports/subscription.repository.js";
import { ListSubscriptionsQuery } from "../application/queries/list-subscriptions.query.js";

/**
 * Paniers récurrents (abonnements) du **client connecté** — mur = son `userId`.
 *
 * `POST /subscriptions` crée un gabarit (le plus souvent depuis une commande) ;
 * `GET /subscriptions/mine` liste les siens. On ne lit jamais l'identité du corps.
 */
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(createSubscriptionPayloadSchema)) payload: CreateSubscriptionPayload,
  ): Promise<CreatedSubscription> {
    return this.commands.execute<CreateSubscriptionCommand, CreatedSubscription>(
      new CreateSubscriptionCommand(user.userId, payload),
    );
  }

  @Get("mine")
  mine(@CurrentUser() user: Principal): Promise<readonly SubscriptionView[]> {
    return this.queries.execute<ListSubscriptionsQuery, readonly SubscriptionView[]>(
      new ListSubscriptionsQuery(user.userId),
    );
  }

  /**
   * Déroge à une échéance précise (« modifier cette commande uniquement ») — on
   * saute la date ou on remplace ses lignes. Mur = le propriétaire (sinon `404`).
   */
  @Put(":id/occurrences/:date")
  @HttpCode(HttpStatus.NO_CONTENT)
  override(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Param("date") date: string,
    @Body(new ZodBody(upsertOccurrenceOverridePayloadSchema))
    payload: UpsertOccurrenceOverridePayload,
  ): Promise<void> {
    return this.commands.execute<UpsertOccurrenceOverrideCommand, void>(
      new UpsertOccurrenceOverrideCommand(
        user.userId,
        id,
        occurrenceDateSchema.parse(date),
        payload,
      ),
    );
  }

  /** Met en pause / reprend un panier récurrent. Mur = le propriétaire (sinon `404`). */
  @Patch(":id/status")
  @HttpCode(HttpStatus.NO_CONTENT)
  setStatus(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body(new ZodBody(setSubscriptionStatusPayloadSchema)) payload: SetSubscriptionStatusPayload,
  ): Promise<void> {
    return this.commands.execute<SetSubscriptionStatusCommand, void>(
      new SetSubscriptionStatusCommand(user.userId, id, payload.status),
    );
  }

  /** Supprime un panier récurrent. Mur = le propriétaire (sinon `404`). */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: Principal, @Param("id") id: string): Promise<void> {
    return this.commands.execute<DeleteSubscriptionCommand, void>(
      new DeleteSubscriptionCommand(user.userId, id),
    );
  }
}
