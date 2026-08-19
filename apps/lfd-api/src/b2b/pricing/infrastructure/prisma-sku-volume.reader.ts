import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SkuVolumeReader, type VolumeWindow } from "../domain/ports/sku-volume.reader.js";

/**
 * Les statuts qui **comptent** dans le volume vendu.
 *
 * Une commande annulée n'a rien vendu : la compter gonflerait le réalisé et
 * ferait croire qu'un objectif est atteint alors que la marchandise n'est jamais
 * partie. Les brouillons non plus — ils n'ont pas été passés.
 *
 * Tout le reste compte, y compris `placed` non encore payée : le volume mesure
 * ce qui a été **commandé**, pas ce qui a été encaissé. Attendre le paiement
 * ferait dépendre l'élasticité du délai de règlement, qui n'a rien à y voir.
 */
const SOLD_STATUSES: readonly OrderStatus[] = [
  OrderStatus.placed,
  OrderStatus.confirmed,
  OrderStatus.in_production,
  OrderStatus.fulfilled,
];

@Injectable()
export class PrismaSkuVolumeReader extends SkuVolumeReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Un `groupBy` par SKU, borné par la fenêtre — une requête quel que soit le
   * nombre d'articles demandés.
   *
   * La date lue est celle de la **commande** (`order.createdAt`), pas celle du
   * service : le volume répond à « qu'est-ce qui s'est vendu pendant cette
   * période ? », et une commande passée en janvier pour février s'est vendue en
   * janvier. C'est aussi la date à laquelle le prix a été résolu, donc la seule
   * qui s'aligne sur la règle qu'on évalue.
   */
  async volumesFor(
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
          status: { in: [...SOLD_STATUSES] },
          createdAt: { gte: window.from, lt: window.to },
        },
      },
      _sum: { quantity: true },
    });

    // Un SKU sans vente n'entre pas dans la table : l'appelant doit pouvoir
    // distinguer « aucune vente » de « pas demandé ».
    return new Map(rows.map((row) => [row.sku, row._sum.quantity ?? 0]));
  }
}
