import {
  type PrincipalSitesMenuView,
  type SubAccountMenuPayload,
  subAccountMenuPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetPrincipalSitesMenuCommand } from "../application/commands/set-principal-sites-menu.command.js";
import { GetPrincipalSitesMenuQuery } from "../application/queries/get-principal-sites-menu.query.js";

/**
 * **La carte commune des sites**, réglée depuis le compte principal
 * (`documentation/comptes-client/carte-des-sites.md`, § 6). Le mur — rôle
 * propre `owner` ou `admin` accepté, principal actif — vit dans les handlers.
 */
@Controller("companies")
export class CompanySitesMenuController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(":principalId/sites-menu")
  async read(
    @CurrentUser() user: Principal,
    @Param("principalId") principalId: string,
  ): Promise<PrincipalSitesMenuView> {
    return this.queries.execute<GetPrincipalSitesMenuQuery, PrincipalSitesMenuView>(
      new GetPrincipalSitesMenuQuery(user.userId, principalId),
    );
  }

  /** Pose la carte commune entière ; `204`. `409` si la société est elle-même un site. */
  @Put(":principalId/sites-menu")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "pose la carte commune entière : rejouée, elle est déjà dans cet état et rien n'est écrit, journalisé ni purgé",
  )
  async set(
    @CurrentUser() user: Principal,
    @Param("principalId") principalId: string,
    @Body(new ZodBody(subAccountMenuPayloadSchema)) payload: SubAccountMenuPayload,
  ): Promise<void> {
    await this.commands.execute<SetPrincipalSitesMenuCommand, void>(
      new SetPrincipalSitesMenuCommand(user.userId, principalId, payload),
    );
  }
}
