import type { FooterContentView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { SaveFooterContentCommand } from "./save-footer-content.command.js";

/**
 * Enregistre le pied de page.
 *
 * Aucune règle métier ici, et c'est normal : ce qui fait la validité d'un pied
 * de page est sa FORME — les trois langues, quatre sections pleines, une maison
 * avec son code postal — et cette forme est tenue par le schéma du contrat, au
 * bord. Ajouter une seconde validation ici la ferait diverger de la première.
 */
@CommandHandler(SaveFooterContentCommand)
export class SaveFooterContentHandler implements ICommandHandler<
  SaveFooterContentCommand,
  FooterContentView
> {
  constructor(private readonly content: PlatformContentRepository) {}

  execute(command: SaveFooterContentCommand): Promise<FooterContentView> {
    return this.content.saveFooter(command.content, command.staffUserId);
  }
}
