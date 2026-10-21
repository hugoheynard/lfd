import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { CorrectSiteResupplyLineCommand } from "./correct-site-resupply-line.command.js";
import { loadSiteResupply } from "./site-resupply-draft.js";

/** **Corrige une quantité de la demande en cours** (lot R1c), sous la version que le poste a vue. */
@CommandHandler(CorrectSiteResupplyLineCommand)
export class CorrectSiteResupplyLineHandler implements ICommandHandler<
  CorrectSiteResupplyLineCommand,
  void
> {
  constructor(private readonly resupplies: SiteResupplyRepository) {}

  async execute(command: CorrectSiteResupplyLineCommand): Promise<void> {
    const draft = await loadSiteResupply(this.resupplies, command.siteId, command.resupplyId);
    draft.assertSeen(command.seenVersion);
    draft.correctLine(command.sku, command.quantity);
    await this.resupplies.save(draft);
  }
}
