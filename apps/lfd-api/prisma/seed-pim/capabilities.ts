import type { CommandBus } from "@nestjs/cqrs";

import { AddProductVariantCommand } from "../../src/pim/catalogue/product/application/add-product-variant.js";
import { DiscontinueProductVariantCommand } from "../../src/pim/catalogue/product/application/discontinue-product-variant.js";
import { SetProductMinQuantitiesCommand } from "../../src/pim/catalogue/product/application/set-product-min-quantities.js";
import { SetProductVariantsAsTilesCommand } from "../../src/pim/catalogue/product/application/set-product-variants-as-tiles.js";
import { SetVariantShopNameCommand } from "../../src/pim/catalogue/product/application/set-variant-shop-name.js";
import { UpdateVariantPricingCommand } from "../../src/pim/catalogue/product/application/update-variant-pricing.js";
import type { PrismaService } from "../../src/platform/database/prisma.service.js";
import type { CorpusProduct, CorpusVariant } from "./corpus.js";

/**
 * **Les gestes de fiche livrés après le premier corpus** — quantité minimale,
 * déclinaisons en vignette, nom de boutique, déclinaison archivée — rejoués par
 * les VRAIS handlers, comme le reste de `replay.ts`.
 *
 * Joués AVANT la signature et la mise en vente (`settle`) : une fiche neuve se
 * signe une fois, complète. Sur une fiche déjà là, chaque geste est
 * idempotent : une déclinaison se retrouve par sa référence, une archivée ne
 * se réarchive pas, un nom ou un minimum inchangé n'écrit pas de fait.
 */
export async function replayCapabilities(
  bus: CommandBus,
  prisma: PrismaService,
  productId: string,
  product: CorpusProduct,
): Promise<void> {
  await setMinQuantities(bus, prisma, productId, product);
  const variants = product.variants ?? [];
  for (const variant of variants) {
    await replayVariant(bus, prisma, productId, variant);
  }
  if (variants.length > 0) {
    await bus.execute<SetProductVariantsAsTilesCommand, void>(
      new SetProductVariantsAsTilesCommand(productId, true),
    );
  }
}

/** Les conditions de vente au poids que la tarification du défaut porte, ou rien. */
export function seedSaleTerms(product: CorpusProduct): {
  readonly saleUnit?: "weight";
  readonly weightMinGrams?: number | null;
  readonly weightStepGrams?: number | null;
} {
  if (product.soldByWeight === undefined) {
    return {};
  }
  return {
    saleUnit: "weight",
    weightMinGrams: product.soldByWeight.weightMinGrams,
    weightStepGrams: product.soldByWeight.weightStepGrams,
  };
}

async function setMinQuantities(
  bus: CommandBus,
  prisma: PrismaService,
  productId: string,
  product: CorpusProduct,
): Promise<void> {
  if (product.minQuantities === undefined) {
    return;
  }
  const defaultVariant = await prisma.productVariant.findFirst({
    where: { productId, isDefault: true },
    select: { id: true },
  });
  if (defaultVariant === null) {
    return;
  }
  await bus.execute<SetProductMinQuantitiesCommand, void>(
    new SetProductMinQuantitiesCommand(productId, defaultVariant.id, product.minQuantities),
  );
}

/**
 * Une déclinaison : ajoutée sous son libellé INTERNE, tarifée, puis nommée pour
 * la boutique — l'agrégat fige alors le libellé interne sur le premier nom, ce
 * qui est exactement l'écart que l'écran montre. Une archivée ne reçoit plus
 * aucun geste : une déclinaison arrêtée ne se tarifie pas.
 */
async function replayVariant(
  bus: CommandBus,
  prisma: PrismaService,
  productId: string,
  variant: CorpusVariant,
): Promise<void> {
  const existing = await prisma.productVariant.findUnique({
    where: { sku: variant.sku },
    select: { id: true, isDiscontinued: true },
  });
  if (existing?.isDiscontinued === true) {
    return;
  }
  const variantId =
    existing?.id ??
    (await bus.execute<AddProductVariantCommand, string>(
      new AddProductVariantCommand(productId, {
        name: { fr: variant.internalLabel },
        sku: variant.sku,
      }),
    ));
  await bus.execute<UpdateVariantPricingCommand, void>(
    new UpdateVariantPricingCommand(productId, variantId, {
      priceCents: variant.priceCents,
      weightGrams: null,
      proPriceHt: variant.proPriceHt,
    }),
  );
  await bus.execute<SetVariantShopNameCommand, void>(
    new SetVariantShopNameCommand(productId, variantId, variant.shopName),
  );
  if (variant.discontinued === true) {
    await bus.execute<DiscontinueProductVariantCommand, void>(
      new DiscontinueProductVariantCommand(productId, variantId),
    );
  }
}
