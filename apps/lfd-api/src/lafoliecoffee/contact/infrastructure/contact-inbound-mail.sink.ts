import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import {
  InboundMailSink,
  type InboundMailNotice,
} from "../../../platform/mailer/inbound/inbound-mail.sink.js";
import { ReceiveEmailReplyCommand } from "../application/commands/receive-email-reply.command.js";

/**
 * Le port que la plateforme déclare pour un e-mail reçu, implémenté par les
 * demandes clients (plan `plan-reponses-par-e-mail.md`, §3) : un message reçu
 * devient une commande nommée, `ReceiveEmailReplyCommand`. Synchrone — son
 * échec remonte au webhook, que Resend rejoue. Relié par `appBootstrap`.
 */
@Injectable()
export class ContactInboundMailSink extends InboundMailSink {
  constructor(private readonly commands: CommandBus) {
    super();
  }

  async accept(notice: InboundMailNotice): Promise<void> {
    await this.commands.execute<ReceiveEmailReplyCommand, void>(
      new ReceiveEmailReplyCommand(notice.emailId),
    );
  }
}
