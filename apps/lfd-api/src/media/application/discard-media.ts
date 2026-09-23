import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { MediaStore } from "../../platform/storage/media-store.js";
import { PIM_EVENTS, PimJournal } from "../../pim/journal/pim-journal.js";
import { MediaLibraryReader } from "../domain/ports/media-library-reader.js";
import { MediaLibraryWriter } from "../domain/ports/media-library-writer.js";
import { MediaNotInLibraryError, MediaStillInUseError } from "../domain/value-objects/image.js";

/** Retire une image de la bibliothèque — octets compris. */
export class DiscardMediaCommand {
  constructor(readonly url: string) {}
}

/**
 * Supprime une image que **personne n'affiche**.
 *
 * ## La règle, et où elle est vraiment tenue
 *
 * « On ne supprime pas une image qui a été mappée quelque part » (Hugo,
 * 2026-09-23). Elle est tenue par **Postgres** : les deux tables de
 * rattachement référencent l'actif en `ON DELETE RESTRICT`. Ce handler ne la
 * remplace pas — il la fait arriver **avant** la tentative, et surtout il la
 * fait PARLER : un refus sans chiffre laisse chercher quelles fiches portent
 * l'image.
 *
 * ⚠️ Le comptage n'est donc pas une autorisation. Il vaut à l'instant de la
 * lecture ; si une fiche attrape l'image entre le compte et la suppression, la
 * contrainte refuse et c'est très bien — elle est le dernier mot.
 *
 * ## L'ordre est la sûreté
 *
 * **L'objet d'abord, les lignes ensuite** — même ordre que le ramassage
 * d'orphelins, et pour la même raison : supprimer les lignes puis échouer sur
 * R2 effacerait la seule trace de ce qu'il reste à supprimer. L'octet resterait
 * dans le bucket sans que rien au monde ne puisse le désigner.
 *
 * À l'endroit, l'échec laisse des lignes qui pointent un objet disparu, sans
 * porteur pour les afficher : le ramassage suivant les prend.
 *
 * ## Ce qui rend le geste supportable
 *
 * L'adressage par contenu : redéposer le même fichier retombe sur la même clé
 * et la même URL. Une suppression regrettée se répare en reposant le fichier —
 * ce qui ne rend **pas** les tags et le point focal, eux définitivement perdus.
 */
@CommandHandler(DiscardMediaCommand)
export class DiscardMediaHandler implements ICommandHandler<DiscardMediaCommand, void> {
  constructor(
    private readonly library: MediaLibraryReader,
    private readonly writer: MediaLibraryWriter,
    private readonly store: MediaStore,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DiscardMediaCommand): Promise<void> {
    const url = command.url.trim();
    const image = await this.library.find(url);
    if (image === null) {
      throw new MediaNotInLibraryError(url);
    }
    if (image.uses > 0) {
      throw new MediaStillInUseError(image.uses);
    }
    if (image.storageKey !== null) {
      // `null` = l'octet n'est pas chez nous (visuel saisi par son URL, du
      // temps où c'était permis). Il n'y a alors rien à retirer d'un bucket.
      await this.store.remove(image.storageKey);
    }
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.mediaDiscarded,
        subjectType: "media_asset",
        subjectId: url,
        payload: { subjectLabel: image.name !== "" ? image.name : (url.split("/").at(-1) ?? url) },
      });
      await this.writer.discard(url, ticket);
    });
  }
}
