import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import {
  localizedText,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class RenameProductVariantCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    readonly name: LocalizedText,
  ) {}
}

/**
 * **Rebaptise une déclinaison.**
 *
 * Le verbe manquait entièrement, et son absence était invisible parce que la
 * création, elle, demandait bien un nom : on le saisissait, la base le gardait,
 * et plus rien ne permettait ni de le lire à l'écran ni de le corriger. Une
 * faute de frappe dans « Boîte de 220 g » était définitive.
 *
 * La référence ne bouge pas avec le nom, et c'est délibéré : elle est dictée au
 * laboratoire et voyage dans les envois vers les canaux, où elle est la clé de
 * rapprochement. Renommer un article n'est pas en fabriquer un autre.
 *
 * Comme les autres sections, un renommage qui ne change rien n'écrit pas de
 * fait : le journal est une trace d'audit, et « renommé » sur un nom identique
 * est un fait qui n'a pas eu lieu.
 */
@CommandHandler(RenameProductVariantCommand)
export class RenameProductVariantHandler implements ICommandHandler<
  RenameProductVariantCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RenameProductVariantCommand): Promise<void> {
    const { productId, variantId } = command;
    const product = await requireProduct(this.products, productId);
    const name = localizedText("nom", command.name);
    const before = nameOf(product.snapshot().variants, variantId);

    product.renameVariant(variantId, name);
    const changes = changesBetween(before, nameOf(product.snapshot().variants, variantId));

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.variantRenamed,
              subjectType: "product",
              subjectId: productId,
              // La déclinaison est DANS la charge, pas dans le sujet :
              // l'historique se lit par fiche, et un sujet « variante » le
              // couperait en autant de fils qu'il y a de déclinaisons.
              payload: {
                subjectLabel: product.snapshot().name.fr,
                // La déclinaison sous son nom APRÈS : c'est celui qu'elle porte
                // depuis ; l'avant est dans le diff.
                variant: { id: variantId, name: name.fr },
                changes,
              },
            })
          : this.journal.untraced("déclinaison renommée sans modification");
      await this.products.save(product, ticket);
    });
  }
}

/** Le nom d'UNE déclinaison, dans la forme que le comparateur du journal lit. */
function nameOf(
  variants: readonly { readonly id: string; readonly name: LocalizedText }[],
  variantId: string,
): Record<string, unknown> {
  const variant = variants.find((candidate) => candidate.id === variantId);
  return { name: variant?.name ?? null };
}
