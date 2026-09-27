import {
  convertMyLoyaltyPointsPayloadSchema,
  type ConvertMyLoyaltyPointsPayload,
  type MyLoyaltyConversionResponse,
  type MyLoyaltyView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ConvertLoyaltyPointsCommand } from "../application/commands/convert-loyalty-points.command.js";
import { GetMyLoyaltyQuery } from "../application/queries/get-my-loyalty.query.js";
import { LoyaltyPersonalSpaceRequiredError } from "../domain/errors/loyalty-errors.js";

/**
 * **Ma fidélité** — l'espace du particulier connecté (plan des points, E1.1).
 *
 * Le titulaire se prend DU PRINCIPAL (`user:<userId>`), jamais du corps : il
 * n'y a pas de paramètre à deviner pour lire ou convertir les points d'autrui.
 * Un espace société n'y a rien (lot F) : la lecture s'y dit fermée, la
 * conversion y est refusée — la frontière d'accès se tient ici, comme
 * `@ActingCompany()` se lit ici.
 */
@Controller("me/loyalty")
export class MyLoyaltyController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  read(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
  ): Promise<MyLoyaltyView> {
    return this.queries.execute<GetMyLoyaltyQuery, MyLoyaltyView>(
      new GetMyLoyaltyQuery(user.userId, companyId),
    );
  }

  /**
   * Convertit des points en bon. `expectedBalancePoints` — le solde affiché —
   * est confronté au livre sous le verrou : un double clic rend 409.
   *
   * @throws {LoyaltyPersonalSpaceRequiredError} depuis un espace société — 403.
   */
  @Post("conversions")
  @HttpCode(HttpStatus.CREATED)
  async convert(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
    @Body(new ZodBody(convertMyLoyaltyPointsPayloadSchema)) payload: ConvertMyLoyaltyPointsPayload,
  ): Promise<MyLoyaltyConversionResponse> {
    if (companyId !== null) {
      throw new LoyaltyPersonalSpaceRequiredError();
    }
    const voucherId = await this.commands.execute<ConvertLoyaltyPointsCommand, string>(
      new ConvertLoyaltyPointsCommand(
        "user",
        user.userId,
        user.userId,
        payload.steps,
        payload.expectedBalancePoints,
      ),
    );
    return { voucherId };
  }
}
