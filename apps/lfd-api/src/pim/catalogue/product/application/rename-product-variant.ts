import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class RenameProductVariantCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    readonly label: string,
  ) {}
}

/**
 * **Rebaptise une déclinaison** — son libellé INTERNE seulement
 * (`documentation/catalogue/plan-identite-de-declinaison.md`, I5).
 *
 * Le crayon de la barre des déclinaisons renommait le nom de boutique, faute
 * d'en avoir un autre : un onglet corrigé changeait la vignette, le devis et ce
 * que lit l'atelier. Le libellé ne part pas sur le fil ; il n'y a donc rien à
 * émettre au catalogue, et le nom de boutique se change ailleurs
 * (`set-variant-shop-name.ts`).
 *
 * Fait NOUVEAU, `variant.internal_label_changed` : `variant.renamed` raconte
 * depuis l'origine le nom de boutique, et le garder pour les deux ferait mentir
 * l'historique. Un renommage qui ne change rien n'écrit pas de fait.
 *
 * La référence ne bouge pas avec le nom : elle est dictée au laboratoire et
 * voyage dans les envois, où elle est la clé de rapprochement.
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
    const before = product.variantInternalLabel(variantId);

    product.renameVariantInternalLabel(variantId, command.label);
    const after = product.variantInternalLabel(variantId);

    await this.uow.run(async () => {
      const ticket =
        before !== after
          ? await this.journal.trace({
              type: PIM_EVENTS.variantInternalLabelChanged,
              subjectType: "product",
              subjectId: productId,
              // La déclinaison est DANS la charge, pas dans le sujet :
              // l'historique se lit par fiche.
              payload: {
                subjectLabel: product.snapshot().name.fr,
                variant: { id: variantId, name: after },
                before,
                after,
              },
            })
          : this.journal.untraced("libellé de déclinaison inchangé");
      await this.products.save(product, ticket);
    });
  }
}
