import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductOptionActivations } from "../domain/entities/product-option-activations.js";
import { ProductOptionActivationRepository } from "../domain/ports/product-option-activation.repository.js";

/**
 * Les activations d'une fiche, une ligne par groupe. Retirer un groupe pose
 * `revoked_at` : la ligne reste, et une réactivation la remet en service.
 */
@Injectable()
export class PrismaProductOptionActivationRepository extends ProductOptionActivationRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async load(productId: string): Promise<ProductOptionActivations> {
    const rows = await this.prisma.productOptionActivation.findMany({ where: { productId } });
    return ProductOptionActivations.reconstitute(
      productId,
      rows.map((row) => ({
        groupId: row.optionGroupId,
        allVariants: row.allVariants,
        variantIds: [...row.variantIds].sort(),
        revokedAt: row.revokedAt,
      })),
    );
  }

  async save(activations: ProductOptionActivations): Promise<void> {
    const { productId } = activations;
    for (const entry of activations.snapshot()) {
      const columns = {
        allVariants: entry.allVariants,
        variantIds: [...entry.variantIds],
        revokedAt: entry.revokedAt,
      };
      await this.prisma.productOptionActivation.upsert({
        where: { productId_optionGroupId: { productId, optionGroupId: entry.groupId } },
        create: { productId, optionGroupId: entry.groupId, ...columns },
        update: columns,
      });
    }
  }
}
