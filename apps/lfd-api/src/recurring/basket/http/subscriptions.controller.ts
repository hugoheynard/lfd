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

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody, ZodParam } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  OpenBasketCommand,
  type OpenedBasket,
} from "../application/commands/open-basket.command.js";
import { StopBasketCommand } from "../application/commands/stop-basket.command.js";
import { SetBasketStatusCommand } from "../application/commands/set-basket-status.command.js";
import { OverrideOccurrenceCommand } from "../../occurrence/application/commands/override-occurrence.command.js";
import { RestoreOccurrenceCommand } from "../../occurrence/application/commands/restore-occurrence.command.js";
import { ListMyBasketsQuery } from "../application/queries/list-my-baskets.query.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";

/**
 * Paniers récurrents du **client connecté** — mur = son `userId`. Les
 * chemins gardent le nom `subscriptions`, que les écrans appellent.
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

  /**
   * Crée un panier dans l'espace de la requête : la société déclarée par
   * l'en-tête d'espace (vérifiée contre les rattachements), `null` en perso.
   * Le panier la porte pour toujours.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
    @Body(new ZodBody(createSubscriptionPayloadSchema)) payload: CreateSubscriptionPayload,
    @IntentKey() intentKey: string,
  ): Promise<OpenedBasket> {
    return this.commands.execute<OpenBasketCommand, OpenedBasket>(
      new OpenBasketCommand(user.userId, payload, companyId, intentKey),
    );
  }

  @Get("mine")
  mine(@CurrentUser() user: Principal): Promise<readonly SubscriptionView[]> {
    return this.queries.execute<ListMyBasketsQuery, readonly SubscriptionView[]>(
      new ListMyBasketsQuery(user.userId),
    );
  }

  /**
   * Déroge à une échéance précise (« modifier cette commande uniquement ») — on
   * saute la date ou on remplace ses lignes. Mur = le propriétaire (sinon `404`).
   */
  @Put(":id/occurrences/:date")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "pose une dérogation : rejouée, la même requête trouve sur la ligne d'échéance la même dérogation (saut, lignes, note) et ne sauve ni ne journalise",
  )
  override(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Param("date", new ZodParam(occurrenceDateSchema, "date")) date: string,
    @Body(new ZodBody(upsertOccurrenceOverridePayloadSchema))
    payload: UpsertOccurrenceOverridePayload,
  ): Promise<void> {
    return this.commands.execute<OverrideOccurrenceCommand, void>(
      new OverrideOccurrenceCommand(user.userId, id, date, payload),
    );
  }

  /**
   * Rétablit une échéance (« revenir au panier habituel ») : une échéance
   * sautée est de nouveau à passer, une échéance modifiée reprend les lignes
   * du gabarit. Mur = le propriétaire (sinon `404`).
   */
  @Delete(":id/occurrences/:date")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "rétablit une échéance : rejouée, l'échéance est déjà au gabarit et l'entité rend faux avant toute écriture ni tout fait",
  )
  restore(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Param("date", new ZodParam(occurrenceDateSchema, "date")) date: string,
  ): Promise<void> {
    return this.commands.execute<RestoreOccurrenceCommand, void>(
      new RestoreOccurrenceCommand(user.userId, id, date),
    );
  }

  /** Met en pause / reprend un panier récurrent. Mur = le propriétaire (sinon `404`). */
  @Patch(":id/status")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "transition : rejouée, le panier est déjà en pause (ou déjà actif) et l'agrégat refuse (409 SubscriptionAlreadyPausedError / SubscriptionAlreadyActiveError) avant toute écriture ni tout fait",
  )
  setStatus(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body(new ZodBody(setSubscriptionStatusPayloadSchema)) payload: SetSubscriptionStatusPayload,
  ): Promise<void> {
    return this.commands.execute<SetBasketStatusCommand, void>(
      new SetBasketStatusCommand(user.userId, id, payload.status),
    );
  }

  /** Arrête un panier récurrent (il reste en base, arrêté). Mur = le propriétaire (sinon `404`). */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "arrête un panier : rejouée, le panier arrêté répond comme absent et le chargement refuse (404 SubscriptionNotFoundError) avant toute écriture ni tout fait",
  )
  remove(@CurrentUser() user: Principal, @Param("id") id: string): Promise<void> {
    return this.commands.execute<StopBasketCommand, void>(new StopBasketCommand(user.userId, id));
  }
}
