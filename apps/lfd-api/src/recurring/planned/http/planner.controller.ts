import {
  openPlannedColumnPayloadSchema,
  plannerQuerySchema,
  plannerSkuSchema,
  putPlannedColumnPayloadSchema,
  type OpenPlannedColumnPayload,
  type PlannedColumnOpened,
  type PlannedColumnWritten,
  type PlannerQuery,
  type PlannerView,
  type PutPlannedColumnPayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody, ZodParam, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { AddWishlistItemCommand } from "../application/commands/add-wishlist-item.command.js";
import { OpenPlannedColumnCommand } from "../application/commands/open-planned-column.command.js";
import { PutPlannedColumnCommand } from "../application/commands/put-planned-column.command.js";
import { RemoveWishlistItemCommand } from "../application/commands/remove-wishlist-item.command.js";
import { WithdrawPlannedColumnCommand } from "../application/commands/withdraw-planned-column.command.js";
import { GetPlannerQuery } from "../application/queries/get-planner.query.js";

/**
 * **Le planificateur de commandes** d'un pro (plan
 * `documentation/commandes/planificateur/plan-planificateur-de-commandes.md`).
 *
 * La société se prend de l'espace (`@ActingCompany()`), jamais de l'adresse ni
 * du corps ; l'espace personnel est refusé (403). Une colonne est un panier
 * pour un jour et un créneau.
 */
@Controller("planner")
export class PlannerController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
    @Query(new ZodQuery(plannerQuerySchema)) query: PlannerQuery,
  ): Promise<PlannerView> {
    return this.queries.execute<GetPlannerQuery, PlannerView>(
      new GetPlannerQuery(user.userId, companyId, query.from),
    );
  }

  @Post("columns")
  @HttpCode(HttpStatus.OK)
  open(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
    @Body(new ZodBody(openPlannedColumnPayloadSchema)) payload: OpenPlannedColumnPayload,
    @IntentKey() intentKey: string,
  ): Promise<PlannedColumnOpened> {
    return this.commands.execute<OpenPlannedColumnCommand, PlannedColumnOpened>(
      new OpenPlannedColumnCommand(user.userId, companyId, payload, intentKey),
    );
  }

  @Put("columns/:id")
  @Idempotent(
    "par l'état visé : la colonne entière ; rejouée, elle porte déjà ces lignes et cet acheminement, l'agrégat ne change rien et rien n'est écrit ni la version montée",
  )
  write(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
    @Param("id") id: string,
    @Body(new ZodBody(putPlannedColumnPayloadSchema)) payload: PutPlannedColumnPayload,
  ): Promise<PlannedColumnWritten> {
    return this.commands.execute<PutPlannedColumnCommand, PlannedColumnWritten>(
      new PutPlannedColumnCommand(user.userId, companyId, id, payload),
    );
  }

  @Delete("columns/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "transition vers « retirée » : rejouée, la colonne l'est déjà et l'agrégat rend faux avant toute écriture",
  )
  async withdraw(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
    @Param("id") id: string,
  ): Promise<void> {
    await this.commands.execute<WithdrawPlannedColumnCommand, void>(
      new WithdrawPlannedColumnCommand(user.userId, companyId, id),
    );
  }

  @Put("wishlist/:sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "par l'état visé : reposer un article déjà dans la liste ne crée rien (clé primaire personne + société + SKU, insertion qui saute un doublon) et ne change pas sa date",
  )
  async addToWishlist(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
    @Param("sku", new ZodParam(plannerSkuSchema, "sku")) sku: string,
  ): Promise<void> {
    await this.commands.execute<AddWishlistItemCommand, void>(
      new AddWishlistItemCommand(user.userId, companyId, sku),
    );
  }

  @Delete("wishlist/:sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "par l'état visé : retirer un article absent ne change rien, la suppression est bornée à la personne, la société et le SKU",
  )
  async removeFromWishlist(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
    @Param("sku", new ZodParam(plannerSkuSchema, "sku")) sku: string,
  ): Promise<void> {
    await this.commands.execute<RemoveWishlistItemCommand, void>(
      new RemoveWishlistItemCommand(user.userId, companyId, sku),
    );
  }
}
