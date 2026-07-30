import { type ActivationSupportPayload, activationSupportPayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../infra/auth/current-user.decorator.js";
import type { Principal } from "../../infra/auth/principal.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { RequestActivationSupportCommand } from "../application/commands/request-activation-support.command.js";

/** Ce que la demande de support renvoie : son identifiant. */
export interface SupportRequestResponse {
  readonly id: string;
}

/**
 * Support à l'activation — le client demande à être contacté par l'équipe
 * commerciale. Muré au niveau **membre** (l'entreprise est dans l'URL, vérifiée
 * contre les memberships). Le contrôleur ne fait que dispatcher au bus.
 */
@Controller("companies")
export class CompanySupportController {
  constructor(private readonly commands: CommandBus) {}

  @Post(":companyId/support/activation")
  @HttpCode(HttpStatus.CREATED)
  async request(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(activationSupportPayloadSchema)) payload: ActivationSupportPayload,
  ): Promise<SupportRequestResponse> {
    const id = await this.commands.execute<RequestActivationSupportCommand, string>(
      new RequestActivationSupportCommand(user.userId, companyId, payload),
    );
    return { id };
  }
}
