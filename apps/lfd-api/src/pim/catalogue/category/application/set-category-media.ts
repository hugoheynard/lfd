import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { mediaItems, type MediaInput } from "../../shared/domain/value-objects/media.js";
import { CategoryEditorialReader } from "../domain/ports/category-editorial-reader.js";
import { CategoryEditorialRepository } from "../domain/ports/category-editorial.repository.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { requireCategory } from "./category-support.js";

export class SetCategoryMediaCommand {
  constructor(
    readonly id: string,
    readonly media: readonly MediaInput[],
  ) {}
}

/**
 * Remplace les visuels d'une famille.
 *
 * Un **remplacement**, pas un ajout : l'écran envoie ce qu'il affiche, et cette
 * liste fait foi. Retirer une image et réordonner les autres sont le même geste
 * pour qui l'exécute ; les découper en routes séparées ferait porter à l'écran
 * une suite d'appels dont l'échec partiel laisserait un ordre incohérent.
 *
 * Les règles ne sont pas réécrites ici — `mediaItems` les tient déjà, et c'est
 * le MÊME code que pour une fiche : URL obligatoire, rôle unique là où il doit
 * l'être, et position dérivée du rang dans la liste reçue.
 */
@CommandHandler(SetCategoryMediaCommand)
export class SetCategoryMediaHandler implements ICommandHandler<SetCategoryMediaCommand, void> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly editorials: CategoryEditorialRepository,
    private readonly readers: CategoryEditorialReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetCategoryMediaCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    const before = await this.readers.mediaOf(command.id);
    const after = mediaItems(command.media);
    // UNE entrée `media`, la liste entière : réordonner EST la modification, et
    // un diff par image ne saurait pas dire la différence entre « déplacée » et
    // « retirée puis ajoutée ».
    const changes = changesBetween({ media: listOf(before) }, { media: listOf(after) });

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.productCategoryMediaSaved,
              subjectType: "product_category",
              subjectId: command.id,
              payload: { subjectLabel: category.name.fr, changes },
            })
          : this.journal.untraced("section enregistrée sans modification");
      await this.editorials.replaceMedia(command.id, after, ticket);
    });
  }
}

/**
 * Les visuels réduits à ce qu'une FICHE décide : l'ordre, l'image et son RÔLE.
 *
 * 🔴 Ni étiquette ni texte alternatif depuis le 2026-09-23 : ils décrivent
 * l'image et ont leur propre fait (`media_asset.described`). Les garder ici
 * ferait apparaître, dans l'historique d'une fiche, une modification que
 * quelqu'un a faite sur une AUTRE — l'image étant partagée.
 *
 * Ni dimensions ni poids non plus : ils décrivent le fichier, pas la décision
 * de l'écran, et bougeraient sans que personne n'ait rien édité.
 *
 * Le rôle manquait, et c'est le geste le plus fréquent de cette section :
 * promouvoir une image en `hero` ne changeait rien d'autre, donc produisait un
 * diff vide et aucun fait du tout (corrigé le 2026-09-23).
 *
 * La POSITION n'y figure pas et n'a pas à y figurer : `changesBetween` compare
 * les tableaux index par index, donc permuter deux visuels change déjà les
 * entrées comparées. L'ajouter ferait doublon avec le rang.
 */
function listOf(
  media: readonly { readonly role: string; readonly url: string }[],
): readonly Record<string, unknown>[] {
  return media.map((item) => ({ role: item.role, url: item.url }));
}
