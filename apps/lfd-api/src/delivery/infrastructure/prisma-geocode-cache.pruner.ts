import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { GeocodeCachePruner } from "../domain/ports/geocode-cache.pruner.js";

/**
 * La purge de `delivery.delivery_geocode`. Une suppression PHYSIQUE, et c'est
 * la règle ici, pas une exception à « pas de DELETE » : cette table n'est pas
 * un agrégat métier mais un cache, et la politique de confidentialité promet
 * au client que la position tirée de son adresse n'est pas conservée plus de
 * 365 jours. Archiver la ligne trahirait la promesse (vérifié le 2026-10-06 :
 * aucune autre table ne référence `delivery_geocode`, sa clé est l'empreinte).
 *
 * Par lots : on choisit d'abord les empreintes, puis on les efface — Prisma
 * n'offre pas de `deleteMany` borné.
 */
@Injectable()
export class PrismaGeocodeCachePruner extends GeocodeCachePruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pruneBatchBefore(instant: Date, limit: number): Promise<number> {
    const stale = await this.prisma.deliveryGeocode.findMany({
      where: { geocodedAt: { lt: instant } },
      select: { fingerprint: true },
      take: limit,
    });
    if (stale.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.deliveryGeocode.deleteMany({
      where: {
        fingerprint: { in: stale.map((row) => row.fingerprint) },
        geocodedAt: { lt: instant },
      },
    });
    return count;
  }
}
