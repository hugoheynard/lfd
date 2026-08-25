import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { EditorialReader, type ProductEditorialView } from "../domain/ports/editorial-reader.js";
import { EditorialRepository } from "../domain/ports/editorial.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import {
  editorial,
  type Editorial,
  type EditorialInput,
} from "../domain/value-objects/editorial.js";
import { requireProduct } from "./product-support.js";

export class UpdateProductEditorialCommand {
  constructor(
    readonly id: string,
    readonly input: EditorialInput,
  ) {}
}

/**
 * Met à jour la couche éditoriale (texte). Les médias suivent leur propre cycle
 * (doc 01) et ne sont **pas** touchés ici — d'où la liste vide passée à `save`.
 */
@CommandHandler(UpdateProductEditorialCommand)
export class UpdateProductEditorialHandler implements ICommandHandler<
  UpdateProductEditorialCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly editorials: EditorialRepository,
    private readonly readers: EditorialReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateProductEditorialCommand): Promise<void> {
    await requireProduct(this.products, command.id);
    // Une lecture de plus, assumée : contrairement à l'identité ou au tarif, la
    // couche éditoriale n'est pas portée par l'agrégat déjà chargé. Sans elle
    // la trace dirait « Communication enregistrée » sans dire quoi — c'est
    // exactement le grain qu'on a écarté.
    const before = await this.readers.findByProduct(command.id);
    const after = editorial(command.input);
    const changes = changesBetween(flatten(before), flatten(after));

    await this.uow.run(async () => {
      await this.editorials.save(command.id, after, []);
      if (Object.keys(changes).length > 0) {
        await this.journal.record({
          type: PIM_EVENTS.productEditorialSaved,
          subjectType: "product",
          subjectId: command.id,
          payload: { changes },
        });
      }
    });
  }
}

/**
 * Les deux formes d'une même absence — `null` côté lecture, `undefined` côté
 * value-object — ramenées à `null`. Les laisser diverger ferait de chaque
 * premier enregistrement un faux changement sur les sept champs.
 */
function flatten(source: Editorial | ProductEditorialView | null): Record<string, unknown> {
  return {
    descriptionShort: source?.descriptionShort ?? null,
    descriptionLong: source?.descriptionLong ?? null,
    story: source?.story ?? null,
    pairing: source?.pairing ?? null,
    brand: source?.brand ?? null,
    seoTitle: source?.seoTitle ?? null,
    seoDescription: source?.seoDescription ?? null,
  };
}
