import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MarketingConsent } from "../../../channels/marketing/marketing-consent.js";
import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import { SubscribeNewsletterCommand } from "./subscribe-newsletter.command.js";

/** La société qui sert la boutique, et donc sa lettre (C5). */
const NEWSLETTER_SPACE: MailBrandCode = "lfc";

/**
 * Le champ du pied de page (C5), par la même demande que les autres lieux :
 * jamais demandé → `pending` et l'e-mail de confirmation ; en attente,
 * inscrite ou DÉSINSCRITE → rien, ni ligne ni e-mail (seul « Mes
 * préférences », connecté, réinscrit). Le champ piège rempli : rien du tout.
 */
@CommandHandler(SubscribeNewsletterCommand)
export class SubscribeNewsletterHandler implements ICommandHandler<
  SubscribeNewsletterCommand,
  void
> {
  constructor(private readonly consent: MarketingConsent) {}

  async execute(command: SubscribeNewsletterCommand): Promise<void> {
    if (command.honeypot.trim() !== "") {
      return;
    }
    await this.consent.request(NEWSLETTER_SPACE, command.address, {
      textVersion: command.textVersion,
      locale: command.locale,
      where: "newsletter",
      ref: null,
      // Rien n'atteste qu'une adresse tapée dans un pied de page est à qui la tape.
      verified: false,
    });
  }
}
