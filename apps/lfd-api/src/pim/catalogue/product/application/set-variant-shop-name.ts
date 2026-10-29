import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import {
  localizedText,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class SetVariantShopNameCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    readonly name: LocalizedText,
  ) {}
}

/**
 * **Le nom de boutique d'une déclinaison**, et ses langues
 * (`documentation/catalogue/plan-identite-de-declinaison.md`, I1, § 3).
 *
 * C'est le nom qui part sur le fil — vignette, devis, commande, facture, et ce
 * que lisent l'atelier et le colisage pour les commandes suivantes. Le fait
 * reste `variant.renamed`, même sens et même forme qu'avant la distinction :
 * il a toujours raconté ce nom-là.
 *
 * Au premier écart, l'agrégat fige le libellé interne sur l'ANCIEN nom, dans la
 * même transaction : sans quoi l'onglet suivrait la boutique.
 *
 * Un nom inchangé n'écrit pas de fait, mais repart au catalogue comme avant.
 */
@CommandHandler(SetVariantShopNameCommand)
export class SetVariantShopNameHandler implements ICommandHandler<SetVariantShopNameCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: SetVariantShopNameCommand): Promise<void> {
    const { productId, variantId } = command;
    const product = await requireProduct(this.products, productId);
    const name = localizedText("nom", command.name);
    const before = nameOf(product.snapshot().variants, variantId);

    product.renameVariantForShop(variantId, name);
    const changes = changesBetween(before, nameOf(product.snapshot().variants, variantId));

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.variantRenamed,
              subjectType: "product",
              subjectId: productId,
              // La déclinaison est DANS la charge, pas dans le sujet :
              // l'historique se lit par fiche.
              payload: {
                subjectLabel: product.snapshot().name.fr,
                // Sous son nom APRÈS : c'est celui qu'elle porte depuis.
                variant: { id: variantId, name: name.fr },
                changes,
              },
            })
          : this.journal.untraced("nom de boutique de déclinaison inchangé");
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([productId]);
    });
  }
}

/** Le nom de boutique d'UNE déclinaison, dans la forme que le comparateur du journal lit. */
function nameOf(
  variants: readonly { readonly id: string; readonly name: LocalizedText }[],
  variantId: string,
): Record<string, unknown> {
  const variant = variants.find((candidate) => candidate.id === variantId);
  return { name: variant?.name ?? null };
}
