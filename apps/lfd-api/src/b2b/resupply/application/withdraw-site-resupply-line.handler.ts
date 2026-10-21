import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { loadSiteResupply } from "./site-resupply-draft.js";
import { WithdrawSiteResupplyLineCommand } from "./withdraw-site-resupply-line.command.js";

/**
 * **Retire un article de la demande en cours** (lot R1c), sous la version
 * que le poste a vue. La demande peut rester vide : elle attend le prochain
 * ajout, et ne s'envoie pas tant qu'elle l'est.
 */
@CommandHandler(WithdrawSiteResupplyLineCommand)
export class WithdrawSiteResupplyLineHandler implements ICommandHandler<
  WithdrawSiteResupplyLineCommand,
  void
> {
  constructor(private readonly resupplies: SiteResupplyRepository) {}

  async execute(command: WithdrawSiteResupplyLineCommand): Promise<void> {
    const draft = await loadSiteResupply(this.resupplies, command.siteId, command.resupplyId);
    draft.assertSeen(command.seenVersion);
    draft.withdrawLine(command.sku);
    await this.resupplies.save(draft);
  }
}
