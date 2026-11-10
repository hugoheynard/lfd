import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ShopCopyRepository } from "../../domain/ports/shop-copy.repository.js";
import { ResetShopCopyDraftCommand } from "./reset-shop-copy-draft.command.js";

/**
 * Pose « revenir à l'original » en brouillon. Ce n'est PAS un effacement : la
 * boutique garde le remplacement jusqu'au prochain « Publier » (§10 — un
 * `DELETE` direct contournait la publication).
 *
 * @sans-journal comme le brouillon d'un texte : la boutique ne change qu'à
 * « Publier », dont le fait porte la valeur retirée.
 */
@CommandHandler(ResetShopCopyDraftCommand)
export class ResetShopCopyDraftHandler implements ICommandHandler<ResetShopCopyDraftCommand, void> {
  constructor(
    private readonly texts: ShopCopyRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /** @throws {ShopCopyChangedError} quelqu'un a écrit ce texte depuis la lecture. */
  async execute(command: ResetShopCopyDraftCommand): Promise<void> {
    await this.uow.run(async () => {
      const entry = await this.texts.load(command.key, command.locale);
      entry.reset(command.expectedRevision, {
        at: this.clock.now(),
        staffId: command.staffUserId,
      });
      await this.texts.save(entry);
    });
  }
}
