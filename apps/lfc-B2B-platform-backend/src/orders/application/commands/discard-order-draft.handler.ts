import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderDraftRepository } from "../../domain/ports/order-draft.repository.js";
import { DiscardOrderDraftCommand } from "./discard-order-draft.command.js";

/**
 * Jette le brouillon. **Idempotent** : jeter deux fois, ou jeter ce qui n'existe
 * pas, n'est pas une erreur — l'appelant veut un écran vide, et il l'a.
 */
@CommandHandler(DiscardOrderDraftCommand)
export class DiscardOrderDraftHandler implements ICommandHandler<DiscardOrderDraftCommand, void> {
  constructor(private readonly drafts: OrderDraftRepository) {}

  execute(command: DiscardOrderDraftCommand): Promise<void> {
    return this.drafts.discard(command.companyId);
  }
}
