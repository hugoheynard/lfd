import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MediaLibraryWriter } from "../domain/ports/media-library-writer.js";
import {
  focalPoint,
  MediaNotInLibraryError,
  mediaTags,
  type FocalPoint,
} from "../domain/value-objects/media.js";

/**
 * Nomme, tague et pointe une image de la bibliothèque.
 *
 * Une seule commande pour les trois, et c'est voulu : elles se décident au même
 * endroit, sur la même image, dans le même geste. Trois routes feraient trois
 * allers-retours dont l'échec partiel laisserait une image à moitié décrite.
 */
export class SaveMediaDetailsCommand {
  constructor(
    readonly url: string,
    readonly name: string,
    readonly tags: readonly string[],
    readonly focal: FocalPoint | null,
  ) {}
}

@CommandHandler(SaveMediaDetailsCommand)
export class SaveMediaDetailsHandler implements ICommandHandler<SaveMediaDetailsCommand, void> {
  constructor(private readonly library: MediaLibraryWriter) {}

  async execute(command: SaveMediaDetailsCommand): Promise<void> {
    // La normalisation et les bornes vivent dans le DOMAINE, pas ici : ce
    // handler orchestre, il ne décide pas de ce qu'est un tag acceptable. Le
    // contrôleur, lui, n'a validé que la FORME du corps reçu.
    const details = {
      name: command.name.trim(),
      tags: mediaTags(command.tags),
      focal: focalPoint(command.focal),
    };

    const known = await this.library.describe(command.url.trim(), details);
    if (!known) {
      // Un succès silencieux ferait croire à l'écran que son étiquette est
      // enregistrée alors qu'elle ne porte sur rien — typiquement une URL
      // recopiée à la main, ou une image que le ramassage vient de retirer.
      throw new MediaNotInLibraryError(command.url.trim());
    }
  }
}
