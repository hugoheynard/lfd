import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MercurialeDraftStore } from "../ports/mercuriale-draft.store.js";
import { SaveMercurialeDraftCommand } from "./save-mercuriale-draft.command.js";

/**
 * Aucun refus ici, et c'est le brouillon qui le veut : une grille incomplète est
 * son état normal. Les invariants tarifaires s'appliquent à la pose.
 */
@CommandHandler(SaveMercurialeDraftCommand)
export class SaveMercurialeDraftHandler implements ICommandHandler<
  SaveMercurialeDraftCommand,
  void
> {
  constructor(private readonly drafts: MercurialeDraftStore) {}

  execute(command: SaveMercurialeDraftCommand): Promise<void> {
    return this.drafts.save(command.companyId, command.payload, command.staffSub);
  }
}
