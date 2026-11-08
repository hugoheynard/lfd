import { SHOP_MARKETING_SPACE } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MarketingConsent } from "../../../../mail/channels/marketing/marketing-consent.js";
import { MarketingWithoutAddressError } from "../../domain/errors/account-errors.js";
import { AcceptMarketingPartnersCommand } from "./accept-marketing-partners.command.js";

/**
 * L'accord vaut pour les sociétés du groupe À CET INSTANT, vues de la
 * boutique (règle 14) ; le registre refuse quand la case n'est pas proposée.
 *
 * `@sans-journal` le compte n'écrit rien : l'écriture est celle du registre
 * du bloc `mail`, qui range lui-même sa preuve (instant, lieu, version et
 * langue du texte, référence du compte, source d'une désinscription) — la
 * trace que la CNIL demande, dans SA transaction.
 */
@CommandHandler(AcceptMarketingPartnersCommand)
export class AcceptMarketingPartnersHandler implements ICommandHandler<
  AcceptMarketingPartnersCommand,
  void
> {
  constructor(private readonly marketing: MarketingConsent) {}

  async execute(command: AcceptMarketingPartnersCommand): Promise<void> {
    if (command.address === "") {
      throw new MarketingWithoutAddressError();
    }
    await this.marketing.requestPartners(SHOP_MARKETING_SPACE, command.address, {
      textVersion: command.textVersion,
      locale: command.locale,
      where: "preferences",
      ref: command.userId,
      verified: command.addressProven,
    });
  }
}
