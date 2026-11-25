import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PlacedProducts } from "../domain/ports/placed-products.js";
import { WorkstationMapVersion } from "../domain/ports/workstation-map-version.js";
import {
  type WorkstationListing,
  WorkstationMapReader,
} from "../domain/ports/workstation-map.reader.js";
import {
  WorkstationOfProducts,
  type WorkstationsOfProducts,
} from "../domain/ports/workstation-of-products.js";
import {
  type WorkstationOwnTrackingLevel,
  WorkstationTrackingLevels,
} from "../domain/ports/workstation-tracking-levels.js";
import { PLACEMENT_SELECT, placementsOf } from "./placement-rows.js";
import { trackingLevelOrNull } from "./tracking-level-column.js";

/** Les postes en service, dans l'ordre des fiches (l'id départage deux rangs égaux). */
const ACTIVE_STATIONS = {
  where: { archivedAt: null },
  orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
  select: { id: true, name: true, position: true },
};

/** Référence produit → sa place réglée ; un produit sans place est absent. */
function positionsOf(
  rows: readonly { readonly productSku: string; readonly position: number | null }[],
): ReadonlyMap<string, number> {
  return new Map(
    rows.flatMap((row) => (row.position === null ? [] : [[row.productSku, row.position] as const])),
  );
}

/**
 * La carte des postes pour la page Postes : sans verrou, sans agrégat. Un
 * produit placé l'est toujours sur des postes en service (l'agrégat refuse
 * d'archiver un poste qui porte des produits).
 */
@Injectable()
export class PrismaWorkstationMapReader extends WorkstationMapReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listing(): Promise<WorkstationListing> {
    const [workstations, placements] = await Promise.all([
      this.prisma.productionWorkstation.findMany({
        ...ACTIVE_STATIONS,
        select: { ...ACTIVE_STATIONS.select, trackingLevel: true },
      }),
      this.prisma.productionWorkstationProduct.findMany({ select: PLACEMENT_SELECT }),
    ]);
    return {
      workstations: workstations.map((station) => ({
        ...station,
        trackingLevel: trackingLevelOrNull(station.trackingLevel),
      })),
      placements: placementsOf(placements),
    };
  }
}

/**
 * Le poste qui finit chacun des produits demandés, en une requête sur ces
 * produits seulement. Les postes d'étape n'y sont pas encore : le rangement
 * ne range une ligne que sous celui qui la finit.
 */
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
            where: { productSku: { in: [...productSkus] }, finishes: true },
            select: { productSku: true, workstationId: true, position: true },
          }),
    ]);
    return {
      workstations,
      byProduct: new Map(placements.map((row) => [row.productSku, row.workstationId])),
      positions: positionsOf(placements),
    };
  }
}

/** Combien de produits ont un poste : un `count` des postes qui finissent, un par produit placé. */
@Injectable()
export class PrismaPlacedProducts extends PlacedProducts {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  count(): Promise<number> {
    return this.prisma.productionWorkstationProduct.count({ where: { finishes: true } });
  }
}

/** Le numéro de la carte : le plus récent `updated_at` des postes et des placements. */
@Injectable()
export class PrismaWorkstationMapVersion extends WorkstationMapVersion {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(): Promise<number> {
    const [stations, placements] = await Promise.all([
      this.prisma.productionWorkstation.aggregate({ _max: { updatedAt: true } }),
      this.prisma.productionWorkstationProduct.aggregate({ _max: { updatedAt: true } }),
    ]);
    return Math.max(
      stations._max.updatedAt?.getTime() ?? 0,
      placements._max.updatedAt?.getTime() ?? 0,
    );
  }
}

/** Le niveau propre de chaque poste en service : une requête sur les postes. */
@Injectable()
export class PrismaWorkstationTrackingLevels extends WorkstationTrackingLevels {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofActive(): Promise<readonly WorkstationOwnTrackingLevel[]> {
    const rows = await this.prisma.productionWorkstation.findMany({
      where: { archivedAt: null },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true, trackingLevel: true },
    });
    return rows.map((row) => ({
      id: row.id,
      trackingLevel: trackingLevelOrNull(row.trackingLevel),
    }));
  }
}
