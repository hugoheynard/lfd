import type { FooterContentView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { PublicSettingsEdgeCache } from "../../../b2b/shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { SaveFooterContentCommand } from "./save-footer-content.command.js";

/**
 * Enregistre le pied de page.
 *
 * Aucune règle métier ici, et c'est normal : ce qui fait la validité d'un pied
 * de page est sa FORME — les trois langues, quatre sections pleines, une maison
 * avec son code postal — et cette forme est tenue par le schéma du contrat, au
 * bord. Ajouter une seconde validation ici la ferait diverger de la première.
 *
 * Les réglages publics gardés par Workers Cache sont purgés **après** la
 * validation (`AfterCommit`) : une écriture refusée ne purge rien, et l'échec
 * de la purge est journalisé sans retenir l'écriture.
 */
@CommandHandler(SaveFooterContentCommand)
export class SaveFooterContentHandler implements ICommandHandler<
  SaveFooterContentCommand,
  FooterContentView
> {
  constructor(
    private readonly content: PlatformContentRepository,
    private readonly afterCommit: AfterCommit,
    private readonly edge: PublicSettingsEdgeCache,
  ) {}

  async execute(command: SaveFooterContentCommand): Promise<FooterContentView> {
    const saved = await this.content.saveFooter(command.content, command.staffUserId);
    this.afterCommit.defer(() => this.edge.purge(), "footer.edge-purge");
    return saved;
  }
}
