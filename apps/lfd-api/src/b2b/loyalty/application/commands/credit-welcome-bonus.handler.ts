import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { LoyaltySettingsReader } from "../../domain/ports/loyalty-settings.store.js";
import { WelcomeBonusCrediting } from "../services/welcome-bonus-crediting.js";
import { CreditWelcomeBonusCommand } from "./credit-welcome-bonus.command.js";

/**
 * Lit le réglage, et laisse {@link WelcomeBonusCrediting} juger et écrire. La
 * règle est celle du domaine (`welcomeBonusFor`) : programme fermé au public,
 * bonus éteint, adresse non prouvée ou déjà crédité — rien, sans bruit.
 *
 * `@hors-transaction` : le crédit ouvre SA transaction sous le verrou du
 * titulaire, et y trace `loyalty.welcome_bonus_credited`.
 */
@CommandHandler(CreditWelcomeBonusCommand)
export class CreditWelcomeBonusHandler implements ICommandHandler<
  CreditWelcomeBonusCommand,
  boolean
> {
  constructor(
    private readonly settings: LoyaltySettingsReader,
    private readonly crediting: WelcomeBonusCrediting,
  ) {}

  async execute(command: CreditWelcomeBonusCommand): Promise<boolean> {
    const settings = await this.settings.read();
    return this.crediting.creditWelcomeBonus(command.userId, settings);
  }
}
