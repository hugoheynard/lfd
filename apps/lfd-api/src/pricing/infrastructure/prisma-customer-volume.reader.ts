import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { CustomerVolumeReader } from "../domain/ports/customer-volume.reader.js";
import type { VolumeWindow } from "../domain/ports/sku-volume.reader.js";

/**
 * Les statuts qui **comptent** dans le cumul d'un engagement.
 *
 * Les mêmes que le volume de marché, et pour la même raison : une commande
 * annulée n'a rien commandé, un brouillon n'a pas été passé. Une commande
 * `placed` non encore payée compte — l'engagement porte sur ce qui est commandé,
 * pas sur ce qui est encaissé, et l'indexer sur le règlement ferait dépendre un
 * palier du délai de paiement.
 */
const COUNTED_STATUSES: readonly OrderStatus[] = [
  OrderStatus.placed,
  OrderStatus.confirmed,
  OrderStatus.in_production,
  OrderStatus.fulfilled,
];

@Injectable()
export class PrismaCustomerVolumeReader extends CustomerVolumeReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Un `groupBy` par SKU borné par le client ET la fenêtre — une requête quel
   * que soit le nombre d'articles du panier.
   *
   * La date lue est celle de la **commande**, comme partout ailleurs dans ce
   * contexte : c'est l'instant où le prix a été résolu, donc le seul qui
   * s'aligne sur la période de l'engagement qu'on évalue.
   */
  async volumesFor(
    companyId: string,
    skus: readonly string[],
    window: VolumeWindow,
  ): Promise<ReadonlyMap<string, number>> {
    if (skus.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.orderLine.groupBy({
      by: ["sku"],
      where: {
        sku: { in: [...skus] },
        order: {
          companyId,
          status: { in: [...COUNTED_STATUSES] },
          createdAt: { gte: window.from, lt: window.to },
        },
      },
      _sum: { quantity: true },
    });
    return new Map(rows.map((row) => [row.sku, row._sum.quantity ?? 0]));
  }
}
