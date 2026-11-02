import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { CorrectSiteResupplyLineCommand } from "./correct-site-resupply-line.command.js";
import { changeDraft } from "./site-resupply-draft.js";

/** **Corrige une quantité de la demande en cours** (R1c), sous la version que le poste a vue. */
@CommandHandler(CorrectSiteResupplyLineCommand)
export class CorrectSiteResupplyLineHandler implements ICommandHandler<
  CorrectSiteResupplyLineCommand,
  void
> {
  constructor(private readonly resupplies: SiteResupplyRepository) {}

  execute(command: CorrectSiteResupplyLineCommand): Promise<void> {
    return changeDraft(this.resupplies, command, (draft) =>
      draft.correctLine(command.sku, command.quantity),
    );
  }
}
