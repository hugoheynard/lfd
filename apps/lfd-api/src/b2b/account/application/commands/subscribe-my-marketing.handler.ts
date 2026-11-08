import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MarketingConsent } from "../../../../mail/channels/marketing/marketing-consent.js";
import { MarketingWithoutAddressError } from "../../domain/errors/account-errors.js";
import { SubscribeMyMarketingCommand } from "./subscribe-my-marketing.command.js";

/**
 * Le registre décide : jamais demandé → accord (ou attente du clic si
 * l'adresse n'est pas prouvée) ; désinscrit → réinscription, par la même
 * double confirmation ; déjà inscrit ou en attente → rien.
 *
 * `@sans-journal` le compte n'écrit rien : l'écriture est celle du registre
 * du bloc `mail`, qui range lui-même sa preuve (instant, lieu, version et
 * langue du texte, référence du compte, source d'une désinscription) — la
 * trace que la CNIL demande, dans SA transaction.
 */
@CommandHandler(SubscribeMyMarketingCommand)
export class SubscribeMyMarketingHandler implements ICommandHandler<
  SubscribeMyMarketingCommand,
  void
> {
  constructor(private readonly marketing: MarketingConsent) {}

  async execute(command: SubscribeMyMarketingCommand): Promise<void> {
    if (command.address === "") {
      throw new MarketingWithoutAddressError();
    }
    await this.marketing.resubscribe(command.space, command.address, {
      textVersion: command.textVersion,
      locale: command.locale,
      where: "preferences",
      ref: command.userId,
      verified: command.addressProven,
    });
  }
}
