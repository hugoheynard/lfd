import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ConsentConfirmTokens } from "../../domain/ports/consent-confirm-tokens.js";
import { MarketingPreferenceRepository } from "../../domain/ports/marketing-preference.repository.js";
import { confirmationIsLive } from "../../domain/services/consent-confirmation.js";
import { MarketingAddresses } from "../services/marketing-addresses.js";
import { ConfirmConsentByTokenCommand } from "./confirm-consent-by-token.command.js";

/**
 * `pending → accepted` pour la demande que le jeton désigne (règle 18).
 * RIEN n'est écrit pour un jeton illisible, expiré (7 jours), rejoué, d'une
 * demande remplacée ou purgée, ou d'une adresse désinscrite depuis — et
 * rien ne lève : lever ferait de la réponse un oracle.
 */
@CommandHandler(ConfirmConsentByTokenCommand)
export class ConfirmConsentByTokenHandler implements ICommandHandler<
  ConfirmConsentByTokenCommand,
  void
> {
  constructor(
    private readonly tokens: ConsentConfirmTokens,
    private readonly addresses: MarketingAddresses,
    private readonly preferences: MarketingPreferenceRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({ token }: ConfirmConsentByTokenCommand): Promise<void> {
    const target = this.tokens.open(token);
    const at = this.clock.now();
    if (target === null || !confirmationIsLive(target.issuedAt, at)) {
      return;
    }
    const print = this.addresses.of(target.recipientKey).print;
    await this.uow.run(async () => {
      const preference = await this.preferences.load(target.space, print);
      if (preference?.confirmIssued(target.issuedAt, at) === true) {
        await this.preferences.save(preference);
      }
    });
  }
}
