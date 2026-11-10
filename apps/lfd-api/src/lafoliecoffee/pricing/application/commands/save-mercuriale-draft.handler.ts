import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { checkedAdmission } from "../../domain/entities/mercuriale-promotion-policy.js";
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

  /**
   * @throws {InconsistentPromotionSelectionError} une politique de promotions
   *   dont le mode et la liste ne vont pas ensemble — refusée ici plutôt que
   *   par le CHECK de la table, qui répondrait 500.
   */
  execute(command: SaveMercurialeDraftCommand): Promise<void> {
    const { payload } = command;
    const promotionPolicy =
      payload.promotionPolicy === undefined ? undefined : checkedAdmission(payload.promotionPolicy);
    return this.drafts.save(
      command.companyId,
      promotionPolicy === undefined
        ? payload
        : {
            ...payload,
            promotionPolicy: {
              ...promotionPolicy,
              promotionIds: [...promotionPolicy.promotionIds],
            },
          },
      command.staffUserId,
    );
  }
}
