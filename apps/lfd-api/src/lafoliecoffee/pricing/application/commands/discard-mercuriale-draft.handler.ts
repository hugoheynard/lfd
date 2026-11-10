import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MercurialeDraftStore } from "../ports/mercuriale-draft.store.js";
import { DiscardMercurialeDraftCommand } from "./discard-mercuriale-draft.command.js";

@CommandHandler(DiscardMercurialeDraftCommand)
export class DiscardMercurialeDraftHandler implements ICommandHandler<
  DiscardMercurialeDraftCommand,
  void
> {
  constructor(private readonly drafts: MercurialeDraftStore) {}

  execute(command: DiscardMercurialeDraftCommand): Promise<void> {
    return this.drafts.discard(command.companyId);
  }
}
