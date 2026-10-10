import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PimImage } from "../domain/entities/catalog-item.js";
import { CatalogVisualsProjection } from "../domain/ports/catalog-visuals.projection.js";

/**
 * Une seule écriture conditionnée par produit : le `where` porte la règle
 * d'ordre, et le geste est posé dans la même écriture — aucune lecture
 * préalable, donc aucune course entre deux livraisons.
 */
@Injectable()
export class PrismaCatalogVisualsProjection extends CatalogVisualsProjection {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async showIfNewer(
    productId: string,
    gestureId: string,
    image: PimImage | null,
    thumbnail: PimImage | null,
  ): Promise<void> {
    await this.prisma.catalogItem.updateMany({
      where: {
        productId,
        OR: [{ visualsGestureId: null }, { visualsGestureId: { lt: gestureId } }],
      },
      data: {
        imageUrl: image?.url ?? null,
        imageAlt: image?.alt ?? null,
        imageWidth: image?.width ?? null,
        imageHeight: image?.height ?? null,
        imageFocalX: image?.focal?.x ?? null,
        imageFocalY: image?.focal?.y ?? null,
        thumbnailUrl: thumbnail?.url ?? null,
        thumbnailAlt: thumbnail?.alt ?? null,
        thumbnailWidth: thumbnail?.width ?? null,
        thumbnailHeight: thumbnail?.height ?? null,
        thumbnailFocalX: thumbnail?.focal?.x ?? null,
        thumbnailFocalY: thumbnail?.focal?.y ?? null,
        visualsGestureId: gestureId,
      },
    });
  }
}
