import { type ContactMessagePayload, contactMessagePayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { resolveClientIp } from "../../../platform/security/client-ip.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SendContactMessageCommand } from "../application/commands/send-contact-message.command.js";
import { CONTACT_MESSAGE_THROTTLE } from "./contact-message.throttle.js";
import { truncateIp } from "./truncate-ip.js";

/**
 * **Écrire sans compte** — `POST /contact-messages` (`demandes-clients.md`,
 * §2.2 et §5.2). Route publique qui ÉCRIT : débit explicite de 3 messages par
 * 10 minutes et par IP, en plus du champ piège et du délai minimal.
 *
 * L'identité est dans le corps, et elle n'est qu'une déclaration : elle sert à
 * répondre, jamais à autoriser.
 */
@Controller("contact-messages")
@Public()
@Throttle(CONTACT_MESSAGE_THROTTLE)
export class ContactMessagesController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * 204 qu'il soit rangé ou écarté par le piège : un robot n'apprend rien.
   *
   * La page fabrique une clé d'intention par message voulu : un double envoi
   * ne dépose ni deux demandes ni deux courriels.
   */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async send(
    @Body(new ZodBody(contactMessagePayloadSchema)) payload: ContactMessagePayload,
    @Req() request: Record<string, unknown>,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<SendContactMessageCommand, void>(
      new SendContactMessageCommand(payload, null, truncateIp(resolveClientIp(request)), intentKey),
    );
  }
}
