import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { EditorialReader } from "../domain/ports/editorial-reader.js";
import { EditorialRepository } from "../domain/ports/editorial.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { mediaItems, type MediaInput } from "../domain/value-objects/editorial.js";
import type { LocalizedText } from "../../shared/domain/value-objects/localized-text.js";
import { requireProduct } from "./product-support.js";

export class SetProductMediaCommand {
  constructor(
    readonly id: string,
    readonly media: readonly MediaInput[],
  ) {}
}

/**
 * Remplace les visuels d'un produit.
 *
 * Un **remplacement**, pas un ajout : l'écran envoie ce qu'il affiche, et cette
 * liste fait foi. Retirer une image et réordonner les autres sont le même geste
 * pour qui l'exécute ; les découper en routes séparées ferait porter à l'écran
 * une suite d'appels dont l'échec partiel laisserait un ordre incohérent.
 *
 * Les règles ne sont pas réécrites ici : `mediaItems` les tient déjà — URL
 * obligatoire, rôle unique là où il doit l'être, et **position dérivée du rang**
 * dans la liste reçue. Deux images ne peuvent donc pas revendiquer la même
 * place, et l'ordre affiché est l'ordre enregistré par construction.
 */
@CommandHandler(SetProductMediaCommand)
export class SetProductMediaHandler implements ICommandHandler<SetProductMediaCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly editorials: EditorialRepository,
    private readonly readers: EditorialReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetProductMediaCommand): Promise<void> {
    await requireProduct(this.products, command.id);
    const before = await this.readers.mediaOf(command.id);
    const after = mediaItems(command.media);
    // UNE seule entrée `media`, la liste entière : c'est un remplacement, et
    // réordonner EST la modification. Un diff par image ne saurait pas dire la
    // différence entre « déplacée » et « retirée puis ajoutée ».
    const changes = changesBetween({ media: listOf(before) }, { media: listOf(after) });

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.productMediaSaved,
              subjectType: "product",
              subjectId: command.id,
              payload: { changes },
            })
          : this.journal.untraced("section enregistrée sans modification");
      await this.editorials.replaceMedia(command.id, after, ticket);
    });
  }
}

/**
 * Les visuels réduits à ce qui se compare : l'ordre, l'image, son étiquette et
 * son texte alternatif. Ni dimensions ni poids — ils décrivent le FICHIER, pas
 * la décision de l'écran, et bougeraient sans que personne n'ait rien édité.
 */
function listOf(
  media: readonly { readonly url: string; readonly name: string; readonly alt: LocalizedText }[],
): readonly Record<string, unknown>[] {
  return media.map((item) => ({ url: item.url, name: item.name, alt: item.alt }));
}
