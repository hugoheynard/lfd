import { type ContactMessagePayload, contactMessagePayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SendContactMessageCommand } from "../application/commands/send-contact-message.command.js";
import { CONTACT_MESSAGE_THROTTLE } from "./contact-message.throttle.js";

/**
 * **Écrire sans compte** — `POST /contact-messages` (`plan-nous-ecrire.md`,
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

  /** 204 qu'il soit rangé ou écarté par le piège : un robot n'apprend rien. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async send(
    @Body(new ZodBody(contactMessagePayloadSchema)) payload: ContactMessagePayload,
  ): Promise<void> {
    await this.commands.execute<SendContactMessageCommand, void>(
      new SendContactMessageCommand(payload, null),
    );
  }
}
