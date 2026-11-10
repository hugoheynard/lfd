import { type ContactMessagePayload, contactMessagePayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { resolveClientIp } from "../../../platform/security/client-ip.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SendContactMessageCommand } from "../application/commands/send-contact-message.command.js";
import { CONTACT_MESSAGE_THROTTLE } from "./contact-message.throttle.js";
import { truncateIp } from "./truncate-ip.js";

/**
 * **Écrire en client connecté** — `POST /me/contact-messages`. Le même message
 * que `POST /contact-messages`, avec en plus la personne et la société pour
 * laquelle elle agit, prises au jeton et au contexte — jamais au corps ; le
 * public s'en déduit au serveur (société active → `b2b`, sinon `b2c`).
 *
 * Une route à part et non une route publique qui lirait un jeton facultatif :
 * le garde global ne résout aucun principal sur une route `@Public`
 * (`auth.guard.ts`, vérifié le 2026-10-09).
 */
@Controller("me/contact-messages")
@Throttle(CONTACT_MESSAGE_THROTTLE)
export class MyContactMessagesController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async send(
    @Body(new ZodBody(contactMessagePayloadSchema)) payload: ContactMessagePayload,
    @Req() request: Record<string, unknown>,
    @CurrentUser() principal: Principal,
    @ActingCompany() companyId: string | null,
  ): Promise<void> {
    await this.commands.execute<SendContactMessageCommand, void>(
      new SendContactMessageCommand(
        payload,
        { userId: principal.userId, companyId },
        truncateIp(resolveClientIp(request)),
      ),
    );
  }
}
