import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CategoryRepository } from "../domain/ports/category.repository.js";
import {
  localizedText,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";
import { requireCategory, requireFreeSlug } from "./category-support.js";

export interface RenameCategoryPayload {
  /** Le nom, dans les langues renseignées — la source est obligatoire. Une
   *  CARTE et non `nameFr` + `nameEn` : ouvrir une langue ne doit pas ajouter un
   *  champ ici, ni chez les quatre autres commandes qui portaient les mêmes. */
  readonly name: LocalizedText;
}

export class RenameCategoryCommand {
  constructor(
    readonly id: string,
    readonly payload: RenameCategoryPayload,
  ) {}
}

/** Le slug suit le nom : c'est l'agrégat qui le re-dérive, plus l'appelant. */
@CommandHandler(RenameCategoryCommand)
export class RenameCategoryHandler implements ICommandHandler<RenameCategoryCommand, void> {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(command: RenameCategoryCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    category.rename(localizedText("nom", command.payload.name));
    await requireFreeSlug(this.categories, category);
    await this.categories.save(category);
  }
}
