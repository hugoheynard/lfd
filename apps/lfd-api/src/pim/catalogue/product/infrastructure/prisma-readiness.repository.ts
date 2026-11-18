import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductReadiness } from "../domain/entities/product-readiness.js";
import { ReadinessRepository } from "../domain/ports/readiness.repository.js";

/**
 * L'écriture de la déclaration en base. Les deux mappers sont ici : la ligne
 * rehydrate l'agrégat, et l'agrégat dit s'il faut poser ou retirer la ligne.
 */
@Injectable()
export class PrismaReadinessRepository extends ReadinessRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async load(productId: string): Promise<ProductReadiness> {
    const row = await this.prisma.productReadiness.findUnique({ where: { productId } });
    return row === null
      ? ProductReadiness.unsigned(productId)
      : ProductReadiness.signed(productId, { readyAt: row.readyAt, readyBy: row.readyBy });
  }

  async save(readiness: ProductReadiness): Promise<void> {
    const { productId, signature } = readiness;
    if (signature === null) {
      // `deleteMany` et non `delete` : une course entre deux retraits ne doit
      // pas finir en 500 sur une ligne déjà partie.
      await this.prisma.productReadiness.deleteMany({ where: { productId } });
      return;
    }
    await this.prisma.productReadiness.upsert({
      where: { productId },
      create: { productId, readyAt: signature.readyAt, readyBy: signature.readyBy },
      update: { readyAt: signature.readyAt, readyBy: signature.readyBy },
    });
  }
}
