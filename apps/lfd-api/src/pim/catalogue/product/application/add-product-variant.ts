import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import {
  localizedText,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import {
  proposeSku,
  variantSkuRoot,
  type SkuAvailability,
} from "../domain/services/sku-generator.js";
import { Sku } from "../domain/value-objects/sku.value-object.js";
import { SKU_AVAILABILITY } from "../infrastructure/prisma-sku-availability.js";
import { requireProduct } from "./product-support.js";

export interface AddProductVariantInput {
  /** Le nom de l'article — « Boîte de 220 g », pas celui de la fiche. */
  readonly name: LocalizedText;
  /**
   * Ce qui la distingue des autres — `{ poids: "220 g" }`. Libre : le
   * référentiel ne connaît pas d'axe de déclinaison, et en imposer un
   * (taille/couleur) ferait rentrer au chausse-pied ce qui n'y rentre pas.
   */
  readonly options?: Readonly<Record<string, string>> | undefined;
  /** Reprise d'une référence imposée. Vide, elle se dérive du rang. */
  readonly sku?: string | undefined;
}

export class AddProductVariantCommand {
  constructor(
    readonly productId: string,
    readonly input: AddProductVariantInput,
  ) {}
}

/**
 * Ajoute une **déclinaison** à une fiche existante.
 *
 * Le référentiel savait ouvrir un produit avec sa déclinaison par défaut, et
 * rien d'autre : toute fiche n'avait donc qu'un article, et c'est pour ça que
 * l'écran n'a jamais eu à parler de déclinaisons.
 *
 * Elle naît **alignée** sur la fiche réglementaire du défaut. C'est l'agrégat
 * qui le décide, pas ce handler — mais la raison mérite d'être ici aussi : née
 * nue, elle rendrait la fiche impubliable (invariant 7), et sur un produit
 * **déjà en vente** elle partirait au canal avec `allergens: null`, que le
 * récepteur ne doit surtout pas lire comme « sans allergène ».
 *
 * Sans tarif, en revanche : une seconde déclinaison existe précisément parce
 * qu'elle se vend autrement, et recopier le prix du défaut inventerait une
 * décision commerciale que personne n'a prise.
 */
@CommandHandler(AddProductVariantCommand)
export class AddProductVariantHandler implements ICommandHandler<AddProductVariantCommand, string> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
    @Inject(SKU_AVAILABILITY) private readonly availability: SkuAvailability,
  ) {}

  async execute(command: AddProductVariantCommand): Promise<string> {
    const product = await requireProduct(this.products, command.productId);
    const name = localizedText("nom", command.input.name);

    // Le rang vient de l'agrégat, qui seul connaît les déclinaisons déjà là. Le
    // dériver ici d'un `count` rouvrirait la porte à deux `-2` sous la même
    // fiche, que seul le registre refuserait — et trop tard pour le dire bien.
    // La référence se fabrique AVANT l'ajout, parce qu'elle se confronte au
    // registre — et son rang vient de l'agrégat, seul à voir les déclinaisons
    // déjà là.
    const sku = await this.skuFor(command.input.sku, product.sku, product.nextVariantPosition);
    const variant = product.addVariant({
      id: this.ids.next(),
      sku,
      name,
      options: command.input.options ?? {},
    });

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.variantAdded,
        subjectType: "product",
        subjectId: command.productId,
        payload: { sku: variant.sku, name, options: command.input.options ?? {} },
      });
      await this.products.save(product, ticket);
    });

    return variant.id;
  }

  private async skuFor(imposed: string | undefined, productSku: string, position: number) {
    if (imposed !== undefined && imposed.trim() !== "") {
      return Sku.create(imposed);
    }
    return proposeSku(variantSkuRoot(Sku.create(productSku), position), this.availability);
  }
}
