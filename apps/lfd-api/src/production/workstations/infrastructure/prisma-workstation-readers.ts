import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PlacedProducts } from "../domain/ports/placed-products.js";
import {
  type WorkstationListing,
  WorkstationMapReader,
} from "../domain/ports/workstation-map.reader.js";
import {
  WorkstationOfProducts,
  type WorkstationsOfProducts,
} from "../domain/ports/workstation-of-products.js";

/** Les postes en service, dans l'ordre des fiches (l'id départage deux rangs égaux). */
const ACTIVE_STATIONS = {
  where: { archivedAt: null },
  orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
  select: { id: true, name: true, position: true },
};

/**
 * La carte des postes pour la page Postes : sans verrou, sans agrégat. Un
 * produit placé l'est toujours sur un poste en service (l'agrégat refuse
 * d'archiver un poste qui porte des produits).
 */
@Injectable()
export class PrismaWorkstationMapReader extends WorkstationMapReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listing(): Promise<WorkstationListing> {
    const [workstations, placements] = await Promise.all([
      this.prisma.productionWorkstation.findMany(ACTIVE_STATIONS),
      this.prisma.productionWorkstationProduct.findMany({
        select: { productSku: true, workstationId: true },
      }),
    ]);
    return {
      workstations,
      placements: new Map(placements.map((row) => [row.productSku, row.workstationId])),
    };
  }
}

/** Le poste des produits demandés, en une requête sur ces produits seulement. */
@Injectable()
export class PrismaWorkstationOfProducts extends WorkstationOfProducts {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async workstationsOf(productSkus: readonly string[]): Promise<WorkstationsOfProducts> {
    const [workstations, placements] = await Promise.all([
      this.prisma.productionWorkstation.findMany(ACTIVE_STATIONS),
      productSkus.length === 0
        ? Promise.resolve([])
        : this.prisma.productionWorkstationProduct.findMany({
            where: { productSku: { in: [...productSkus] } },
            select: { productSku: true, workstationId: true },
          }),
    ]);
    return {
      workstations,
      byProduct: new Map(placements.map((row) => [row.productSku, row.workstationId])),
    };
  }
}

/** Combien de produits ont un poste : un `count`. */
@Injectable()
export class PrismaPlacedProducts extends PlacedProducts {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  count(): Promise<number> {
    return this.prisma.productionWorkstationProduct.count();
  }
}
