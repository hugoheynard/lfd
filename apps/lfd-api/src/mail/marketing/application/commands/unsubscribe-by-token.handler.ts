import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { UnsubscribeTokens } from "../../domain/ports/unsubscribe-tokens.js";
import { MarketingAddresses } from "../services/marketing-addresses.js";
import { MarketingUnsubscriber } from "../services/marketing-unsubscriber.js";
import { UnsubscribeByTokenCommand } from "./unsubscribe-by-token.command.js";

/**
 * Désinscrit l'espace du jeton — et, si demandé, toutes les autres lignes de
 * l'adresse. Idempotent. Un jeton illisible ne lève RIEN : lever ferait de
 * la réponse un oracle (contradiction : « pas d'oracle par la page »).
 */
@CommandHandler(UnsubscribeByTokenCommand)
export class UnsubscribeByTokenHandler implements ICommandHandler<UnsubscribeByTokenCommand, void> {
  constructor(
    private readonly tokens: UnsubscribeTokens,
    private readonly addresses: MarketingAddresses,
    private readonly unsubscriber: MarketingUnsubscriber,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({ token, oneClick, wholeGroup }: UnsubscribeByTokenCommand): Promise<void> {
    const target = this.tokens.open(token);
    if (target === null) {
      return;
    }
    const address = this.addresses.of(target.recipientKey);
    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.unsubscriber.unsubscribe(target.space, address, {
        at,
        source: oneClick ? "one_click" : "link",
      });
      if (wholeGroup) {
        await this.unsubscriber.unsubscribeGroup(target.space, address, at);
      }
    });
  }
}
