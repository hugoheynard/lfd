import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { OperationImageFacts } from "../domain/entities/catalog-operation.js";
import { CatalogOperationImageProjection } from "../domain/ports/catalog-operation-image.projection.js";

/**
 * Une seule écriture conditionnée : le `where` porte la règle d'ordre, et le
 * geste est posé dans la même écriture — aucune lecture préalable, donc
 * aucune course entre deux livraisons.
 */
@Injectable()
export class PrismaCatalogOperationImageProjection extends CatalogOperationImageProjection {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async showIfNewer(
    operationKey: string,
    gestureId: string,
    image: OperationImageFacts | null,
  ): Promise<void> {
    await this.prisma.catalogOperation.updateMany({
      where: {
        key: operationKey,
        OR: [{ imageGestureId: null }, { imageGestureId: { lt: gestureId } }],
      },
      data: {
        imageUrl: image?.url ?? null,
        imageAlt: image?.alt ?? null,
        imageFocalX: image?.focal?.x ?? null,
        imageFocalY: image?.focal?.y ?? null,
        imageGestureId: gestureId,
      },
    });
  }
}
