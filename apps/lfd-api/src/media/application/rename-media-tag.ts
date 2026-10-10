import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { MEDIA_EVENTS, MediaJournal } from "../journal/media-journal.js";
import { MediaTagReader, MediaTagWriter } from "../domain/ports/media-tags.js";
import { renameTag, targetTag } from "../domain/value-objects/tag-vocabulary.js";

/** Renomme un mot-clé sur toutes les images qui le portent. */
export class RenameMediaTagCommand {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}
}

/**
 * Renomme — ou fusionne — un mot-clé dans tout le fonds.
 *
 * Rend `void`, et c'est CQRS : l'écran relit `GET /media/tags`. Le compte des
 * images et la fusion sont dans le fait du journal, qui est l'endroit où l'on
 * pose la question « qu'a fait ce geste ».
 *
 * 🔴 Lecture, fait et écriture dans **une** unité de travail : un renommage à
 * moitié appliqué laisserait deux mots là où l'on en voulait un.
 *
 * ⚠️ La lecture n'est pas un verrou (pas de `SELECT … FOR UPDATE` sans SQL
 * brut). Une description d'image enregistrée entre la lecture et l'écriture
 * perdrait ses mots-clés au profit de ceux d'ici ; la fenêtre est celle d'une
 * transaction courte, et le geste se refait.
 */
@CommandHandler(RenameMediaTagCommand)
export class RenameMediaTagHandler implements ICommandHandler<RenameMediaTagCommand, void> {
  constructor(
    private readonly reader: MediaTagReader,
    private readonly writer: MediaTagWriter,
    private readonly journal: MediaJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RenameMediaTagCommand): Promise<void> {
    await this.uow.run(async () => {
      // On cherche ce que la base porte vraiment, pas ce que l'écran a envoyé.
      const carriers = await this.reader.imagesTagged(targetTag(command.from));
      const rename = renameTag(carriers, command.from, command.to);
      const ticket = await this.journal.trace({
        type: MEDIA_EVENTS.tagRenamed,
        subjectType: "media_tag",
        subjectId: rename.from,
        payload: {
          subjectLabel: rename.from,
          from: rename.from,
          to: rename.to,
          images: rename.images.length,
          merged: rename.merged,
        },
      });
      await this.writer.retag(rename.images, ticket);
    });
  }
}
