import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { MediaLibraryReader } from "../domain/ports/media-library-reader.js";
import { MediaLibraryWriter } from "../domain/ports/media-library-writer.js";
import { localizedText, SOURCE_LOCALE } from "../domain/value-objects/localized-text.js";
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
    readonly alt: Readonly<Record<string, string>>,
    readonly focal: FocalPoint | null,
  ) {}
}

@CommandHandler(SaveMediaDetailsCommand)
export class SaveMediaDetailsHandler implements ICommandHandler<SaveMediaDetailsCommand, void> {
  constructor(
    private readonly library: MediaLibraryWriter,
    private readonly readers: MediaLibraryReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SaveMediaDetailsCommand): Promise<void> {
    const url = command.url.trim();
    const before = await this.readers.find(url);
    if (before === null) {
      // Un succès silencieux ferait croire à l'écran que son étiquette est
      // enregistrée alors qu'elle ne porte sur rien — typiquement une URL
      // recopiée à la main, ou une image que le ramassage vient de retirer.
      throw new MediaNotInLibraryError(url);
    }

    // La normalisation et les bornes vivent dans le DOMAINE, pas ici : ce
    // handler orchestre, il ne décide pas de ce qu'est un tag acceptable. Le
    // contrôleur, lui, n'a validé que la FORME du corps reçu.
    const details = {
      name: command.name.trim(),
      tags: mediaTags(command.tags),
      // 🔴 Le repli sur l'URL, et pas un refus. Le value object exige une
      // langue source — à juste titre : une alternative sans français n'en est
      // pas une. Mais « je n'ai pas encore écrit d'alternative » est un état
      // légitime de la bibliothèque, et l'exiger interdirait de poser un
      // mot-clé sur une image qu'on n'a pas encore décrite.
      //
      // Le repli est l'URL, comme partout ailleurs dans ce dépôt : une
      // alternative absente doit se VOIR, jamais se confondre avec une
      // alternative rédigée.
      alt: localizedText(
        "texte alternatif",
        command.alt[SOURCE_LOCALE] === undefined ? { [SOURCE_LOCALE]: url } : command.alt,
      ),
      focal: focalPoint(command.focal),
    };

    const changes = changesBetween(
      { name: before.name, tags: [...before.tags], alt: before.alt, focal: before.focal },
      { name: details.name, tags: [...details.tags], alt: details.alt, focal: details.focal },
    );

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.mediaDescribed,
              subjectType: "media_asset",
              // L'URL, parce que c'est l'identité de l'image : les inscriptions
              // sont recréées à chaque enregistrement de fiche, un identifiant
              // d'actif ne désignerait rien de durable.
              subjectId: url,
              payload: { subjectLabel: labelOf(before.name, url), changes },
            })
          : // Réenvoyer les mêmes valeurs est le cas NORMAL : l'écran renvoie
            // les trois champs à chaque geste, même quand il n'en change qu'un.
            // Tracer « rien n'a bougé » remplirait le journal de bruit.
            this.journal.untraced("aucune décision modifiée");
      await this.library.describe(url, details, ticket);
    });
  }
}

/**
 * Le nom sous lequel l'image apparaîtra dans le journal.
 *
 * L'étiquette quand elle existe, le **nom de fichier** sinon — jamais l'URL
 * entière : elle fait cent caractères de hachage, et une ligne de journal se
 * lit par quelqu'un qui n'a pas le code sous les yeux.
 */
function labelOf(name: string, url: string): string {
  return name !== "" ? name : (url.split("/").at(-1) ?? url);
}
