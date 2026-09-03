import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { VariantAspect } from "../domain/entities/variant.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class AlignVariantOnDefaultCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    /** La section visée — chacune s'aligne pour ses propres raisons. */
    readonly aspect: VariantAspect,
    /** `true` = elle suit le défaut ; `false` = elle reprend la sienne. */
    readonly aligned: boolean,
  ) {}
}

/**
 * **« Cette déclinaison suit la déclinaison par défaut, sur cette section. »**
 *
 * C'est une affirmation, pas un réglage d'affichage : sur le réglementaire elle
 * décide ce qui part sur l'étiquette, sur le tarif ce qui est facturé. D'où un
 * geste nommé, journalisé, et refusé sur la déclinaison par défaut — qui ne peut
 * pas se suivre elle-même.
 *
 * Le lien est **vivant**, et c'est tout le choix : corriger un allergène ou un
 * prix sur le défaut corrige toutes celles qui le suivent. Une copie à la
 * création aurait laissé les autres affirmer, pour toujours, ce qu'on venait de
 * reconnaître comme faux.
 *
 * S'aligner ne détruit pas ce que la déclinaison portait — cela dort, et se
 * désaligner le rend. Une case à cocher n'a pas à supprimer une donnée
 * réglementaire ni un prix.
 */
@CommandHandler(AlignVariantOnDefaultCommand)
export class AlignVariantOnDefaultHandler implements ICommandHandler<
  AlignVariantOnDefaultCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AlignVariantOnDefaultCommand): Promise<void> {
    const product = await requireProduct(this.products, command.productId);
    const before = product.snapshot().variants.find((variant) => variant.id === command.variantId);

    // L'appartenance et le refus du défaut sont tenus par l'agrégat : une
    // requête forgée ne peut ni aligner la déclinaison d'un autre produit, ni
    // faire suivre le défaut à lui-même.
    product.alignVariant(command.variantId, command.aspect, command.aligned);

    // Rien n'a changé : ne rien journaliser. Un fait « alignée » sur une
    // déclinaison qui l'était déjà est un fait qui n'a pas eu lieu, et c'est
    // l'historique qu'on vient relire le jour où une étiquette est fausse.
    const wasAligned =
      command.aspect === "regulatory"
        ? before?.regulatoryFollowsDefault
        : before?.pricingFollowsDefault;
    if (wasAligned === command.aligned) {
      return;
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.variantAligned,
        subjectType: "product",
        subjectId: command.productId,
        payload: {
          sku: before?.sku ?? command.variantId,
          aspect: command.aspect,
          aligned: command.aligned,
        },
      });
      await this.products.save(product, ticket);
    });
  }
}
