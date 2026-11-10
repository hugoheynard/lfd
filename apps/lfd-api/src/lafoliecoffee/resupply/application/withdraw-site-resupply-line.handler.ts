import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { changeDraft } from "./site-resupply-draft.js";
import { WithdrawSiteResupplyLineCommand } from "./withdraw-site-resupply-line.command.js";

/**
 * **Retire un article de la demande en cours** (R1c), sous la version
 * que le poste a vue. La demande peut rester vide : elle attend le prochain
 * ajout, et ne s'envoie pas tant qu'elle l'est.
 */
@CommandHandler(WithdrawSiteResupplyLineCommand)
export class WithdrawSiteResupplyLineHandler implements ICommandHandler<
  WithdrawSiteResupplyLineCommand,
  void
> {
  constructor(private readonly resupplies: SiteResupplyRepository) {}

  execute(command: WithdrawSiteResupplyLineCommand): Promise<void> {
    return changeDraft(this.resupplies, command, (draft) => draft.withdrawLine(command.sku));
  }
}
