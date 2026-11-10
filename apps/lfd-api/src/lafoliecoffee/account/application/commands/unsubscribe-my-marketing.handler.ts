import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MarketingConsent } from "../../../../mail/channels/marketing/marketing-consent.js";
import { MarketingWithoutAddressError } from "../../domain/errors/account-errors.js";
import { UnsubscribeMyMarketingCommand } from "./unsubscribe-my-marketing.command.js";

/**
 * La source rangée est `link` — « la personne, par un bouton d'une page ».
 * La liste fermée du registre (`link`, `one_click`, `staff`, `group`) n'a
 * pas de valeur propre à « Mes préférences », et l'en doter demanderait une
 * migration de sa contrainte (vérifié le 2026-11-09).
 */
const PREFERENCES_SOURCE = "link";

/**
 * Idempotent : une adresse déjà désinscrite garde son premier instant.
 *
 * `@sans-journal` le compte n'écrit rien : l'écriture est celle du registre
 * du bloc `mail`, qui range lui-même sa preuve (instant, lieu, version et
 * langue du texte, référence du compte, source d'une désinscription) — la
 * trace que la CNIL demande, dans SA transaction.
 */
@CommandHandler(UnsubscribeMyMarketingCommand)
export class UnsubscribeMyMarketingHandler implements ICommandHandler<
  UnsubscribeMyMarketingCommand,
  void
> {
  constructor(private readonly marketing: MarketingConsent) {}

  async execute(command: UnsubscribeMyMarketingCommand): Promise<void> {
    if (command.address === "") {
      throw new MarketingWithoutAddressError();
    }
    await this.marketing.unsubscribe(command.space, command.address, PREFERENCES_SOURCE);
  }
}
