import { type ActivationSupportPayload, activationSupportPayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
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
 * commerciale.
 *
 * Route **unique**, portée par la personne connectée, la société étant dans le
 * corps et **facultative** : un prospect qui n'a pas encore déclaré d'entreprise
 * doit pouvoir demander un rappel, et c'est justement la population qu'on
 * cherche à capter. Le mur (être membre) se vérifie dans le handler, et
 * seulement quand une société est désignée — le mettre dans l'URL le rendait
 * obligatoire par construction.
 *
 * Même forme que la commande sans entreprise : une route unifiée plutôt que deux
 * chemins qui divergeraient.
 */
@Controller("support")
export class SupportController {
  constructor(private readonly commands: CommandBus) {}

  @Post("activation")
  @HttpCode(HttpStatus.CREATED)
  async request(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(activationSupportPayloadSchema)) payload: ActivationSupportPayload,
  ): Promise<SupportRequestResponse> {
    const id = await this.commands.execute<RequestActivationSupportCommand, string>(
      new RequestActivationSupportCommand(user.userId, payload),
    );
    return { id };
  }
}
