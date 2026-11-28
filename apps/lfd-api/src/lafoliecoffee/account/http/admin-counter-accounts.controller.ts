import {
  openCounterAccountPayloadSchema,
  type CreatedIdResponse,
  type OpenCounterAccountPayload,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { OpenCounterAccountCommand } from "../application/commands/open-counter-account.command.js";

/**
 * Surface des **comptes du comptoir** (`plan-comptes-du-comptoir.md`, § 3.4) :
 * un agent ouvre un compte pro incomplet pour y commander au compte. Sous
 * `b2b_counter_accounts`, détachée de `b2b_counter`, qui ne fait que lire.
 */
@Controller("admin/counter/accounts")
@AdminSurface("b2b_counter_accounts")
export class AdminCounterAccountsController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Ouvre un compte `counter_opened`, au mensuel et au virement, avec la
   * trace de la case « pièce d'identité vue ». Rend l'id ; l'écran relit la
   * fiche. Une fois par intention (`Idempotency-Key`).
   */
  @Post()
  @RequirePermission("b2b_counter_accounts:write")
  @HttpCode(HttpStatus.CREATED)
  async open(
    @Body(new ZodBody(openCounterAccountPayloadSchema)) payload: OpenCounterAccountPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<OpenCounterAccountCommand, string>(
      new OpenCounterAccountCommand(
        payload.enseigne,
        payload.contact,
        payload.identitySeen,
        staffUserId,
        intentKey,
      ),
    );
    return { id };
  }
}
