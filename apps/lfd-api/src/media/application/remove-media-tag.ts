import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { MEDIA_EVENTS, MediaJournal } from "../journal/media-journal.js";
import { MediaTagReader, MediaTagWriter } from "../domain/ports/media-tags.js";
import { removeTag, targetTag } from "../domain/value-objects/tag-vocabulary.js";

/** Retire un mot-clé de toutes les images qui le portent. */
export class RemoveMediaTagCommand {
  constructor(readonly tag: string) {}
}

/**
 * Retire un mot-clé de tout le fonds — un fait pour le geste, pas un par image.
 *
 * Même unité de travail et même fenêtre que le renommage
 * (`RenameMediaTagHandler`) : la lecture n'est pas un verrou.
 */
@CommandHandler(RemoveMediaTagCommand)
export class RemoveMediaTagHandler implements ICommandHandler<RemoveMediaTagCommand, void> {
  constructor(
    private readonly reader: MediaTagReader,
    private readonly writer: MediaTagWriter,
    private readonly journal: MediaJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveMediaTagCommand): Promise<void> {
    await this.uow.run(async () => {
      const carriers = await this.reader.imagesTagged(targetTag(command.tag));
      const removal = removeTag(carriers, command.tag);
      const ticket = await this.journal.trace({
        type: MEDIA_EVENTS.tagRemoved,
        subjectType: "media_tag",
        subjectId: removal.tag,
        payload: { subjectLabel: removal.tag, tag: removal.tag, images: removal.images.length },
      });
      await this.writer.retag(removal.images, ticket);
    });
  }
}
