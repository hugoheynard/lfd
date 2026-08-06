import {
  createSubscriptionPayloadSchema,
  occurrenceDateSchema,
  upsertOccurrenceOverridePayloadSchema,
  type CreateSubscriptionPayload,
  type SubscriptionView,
  type UpsertOccurrenceOverridePayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../infra/auth/current-user.decorator.js";
import type { Principal } from "../../infra/auth/principal.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { CreateSubscriptionCommand } from "../application/commands/create-subscription.command.js";
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
}
