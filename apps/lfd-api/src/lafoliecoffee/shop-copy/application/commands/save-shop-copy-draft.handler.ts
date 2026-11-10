import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ShopCopyRepository } from "../../domain/ports/shop-copy.repository.js";
import { ShopCopyManifest } from "../../domain/shop-copy-manifest.js";
import { SaveShopCopyDraftCommand } from "./save-shop-copy-draft.command.js";

/**
 * Écrit un remplacement en brouillon.
 *
 * @sans-journal un brouillon n'est vu de personne hors de l'éditeur ; c'est
 * « Publier » qui change la boutique, et son fait porte chaque texte avant et
 * après. La ligne garde de toute façon son auteur et son instant (`draft_by`,
 * `draft_at`).
 */
@CommandHandler(SaveShopCopyDraftCommand)
export class SaveShopCopyDraftHandler implements ICommandHandler<SaveShopCopyDraftCommand, void> {
  constructor(
    private readonly texts: ShopCopyRepository,
    private readonly manifest: ShopCopyManifest,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {ShopCopyChangedError} quelqu'un a écrit ce texte depuis la lecture.
   * @throws {UnknownShopCopyKeyError} la clé n'est pas dans le manifeste.
   * @throws {InvalidShopCopyTextError} un garde-fou refuse le texte.
   */
  async execute(command: SaveShopCopyDraftCommand): Promise<void> {
    await this.uow.run(async () => {
      const entry = await this.texts.load(command.key, command.locale);
      entry.draft(command.text, this.manifest, command.expectedRevision, {
        at: this.clock.now(),
        staffId: command.staffUserId,
      });
      await this.texts.save(entry);
    });
  }
}
