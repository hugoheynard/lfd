import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class AlignVariantRegulatoryCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    /** `true` = elle suit le défaut ; `false` = elle reprend la sienne. */
    readonly aligned: boolean,
  ) {}
}

/**
 * **« Cette déclinaison a la même fiche réglementaire que celle par défaut. »**
 *
 * C'est une affirmation, pas un réglage d'affichage : elle décide ce qui part
 * sur l'étiquette et chez les canaux. D'où un geste nommé, journalisé, et
 * refusé sur la déclinaison par défaut — qui ne peut pas se suivre elle-même.
 *
 * Le lien est **vivant**, et c'est tout le choix : corriger un allergène sur le
 * défaut corrige toutes celles qui le suivent. Une copie à la création aurait
 * laissé les autres affirmer, pour toujours, ce qu'on venait de reconnaître
 * comme faux.
 *
 * S'aligner ne détruit pas la fiche propre, si elle existait — elle dort, et se
 * désaligner la rend. Une case à cocher n'a pas à supprimer de la donnée
 * réglementaire.
 */
@CommandHandler(AlignVariantRegulatoryCommand)
export class AlignVariantRegulatoryHandler implements ICommandHandler<
  AlignVariantRegulatoryCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AlignVariantRegulatoryCommand): Promise<void> {
    const product = await requireProduct(this.products, command.productId);
    const before = product.snapshot().variants.find((variant) => variant.id === command.variantId);

    // L'appartenance et le refus du défaut sont tenus par l'agrégat : une
    // requête forgée ne peut ni aligner la déclinaison d'un autre produit, ni
    // faire suivre le défaut à lui-même.
    product.alignVariantRegulatory(command.variantId, command.aligned);

    // Rien n'a changé : ne rien journaliser. Un fait « alignée » sur une
    // déclinaison qui l'était déjà est un fait qui n'a pas eu lieu, et c'est
    // l'historique qu'on vient relire le jour où une étiquette est fausse.
    if (before?.regulatoryFollowsDefault === command.aligned) {
      return;
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.variantRegulatoryAligned,
        subjectType: "product",
        subjectId: command.productId,
        payload: { sku: before?.sku ?? command.variantId, aligned: command.aligned },
      });
      await this.products.save(product, ticket);
    });
  }
}
