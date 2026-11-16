import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  type Workstation,
  WorkstationMap,
  type WorkstationMapState,
} from "../domain/entities/workstation-map.js";
import { WorkstationNameTakenError } from "../domain/errors/workstation-errors.js";
import {
  WorkstationMapRepository,
  type WorkstationMapStamp,
} from "../domain/ports/workstation-map.repository.js";

/** La clé du verrou consultatif : aucune autre ne la porte. */
const WORKSTATION_MAP_LOCK = "production_workstation:map";

/** Le chargement demandé hors d'une unité de travail : un défaut de code, pas un refus. */
class WorkstationMapLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "production.workstation.lock_outside_transaction",
      "La carte des postes a été chargée hors d'une unité de travail : son verrou serait relâché aussitôt pris. Rien n'a été écrit ; signalez-le à l'équipe technique.",
    );
  }
}

interface WorkstationRow {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly archivedAt: Date | null;
}

interface PlacementRow {
  readonly productSku: string;
  readonly workstationId: string;
}

function toDomain(
  stations: readonly WorkstationRow[],
  placements: readonly PlacementRow[],
): WorkstationMap {
  const state: WorkstationMapState = {
    workstations: stations.map((row) => ({ ...row })),
    placements: new Map(placements.map((row) => [row.productSku, row.workstationId])),
  };
  return WorkstationMap.rehydrate(state);
}

function toPersistence(station: Workstation, stamp: WorkstationMapStamp) {
  return {
    id: station.id,
    name: station.name,
    position: station.position,
    archivedAt: station.archivedAt,
    updatedAt: stamp.at,
    updatedByStaffId: stamp.staffUserId,
    updatedByName: stamp.name,
  };
}

/**
 * Le dépôt de la carte des postes (plan `fournil/plan-postes-du-fournil.md`,
 * § 3.3). Le chargement prend `pg_advisory_xact_lock` sur la carte, tenu
 * jusqu'au `COMMIT` : deux gestes concurrents se suivent, et les règles de
 * l'agrégat (nom unique, poste vide avant l'archivage, poste en service)
 * restent vraies. La sauvegarde n'écrit que la différence.
 *
 * Un produit remis « à ranger » perd sa ligne de placement : une ligne de
 * placement n'est pas un agrégat, elle dit seulement « ce produit est à ce
 * poste », et son absence est l'état « à ranger » que la table décrit. Le
 * poste, lui, s'archive et ne s'efface jamais.
 */
@Injectable()
export class PrismaWorkstationMapRepository extends WorkstationMapRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(): Promise<WorkstationMap> {
    await this.lock();
    const [stations, placements] = await Promise.all([
      this.prisma.productionWorkstation.findMany({
        select: { id: true, name: true, position: true, archivedAt: true },
      }),
      this.prisma.productionWorkstationProduct.findMany({
        select: { productSku: true, workstationId: true },
      }),
    ]);
    return toDomain(stations, placements);
  }

  async save(map: WorkstationMap, stamp: WorkstationMapStamp): Promise<void> {
    const { workstations, placements } = map.changes();
    for (const station of workstations) {
      await this.writeStation(toPersistence(station, stamp));
    }
    const removed = [...placements].flatMap(([product, station]) =>
      station === null ? [product] : [],
    );
    if (removed.length > 0) {
      await this.prisma.productionWorkstationProduct.deleteMany({
        where: { productSku: { in: removed } },
      });
    }
    for (const [productSku, workstationId] of placements) {
      if (workstationId !== null) {
        const row = {
          workstationId,
          updatedAt: stamp.at,
          updatedByStaffId: stamp.staffUserId,
          updatedByName: stamp.name,
        };
        await this.prisma.productionWorkstationProduct.upsert({
          where: { productSku },
          create: { productSku, ...row },
          update: row,
        });
      }
    }
  }

  private async writeStation(row: ReturnType<typeof toPersistence>): Promise<void> {
    try {
      await this.prisma.productionWorkstation.upsert({
        where: { id: row.id },
        create: row,
        update: row,
      });
    } catch (error) {
      // L'index `lower(name)` des postes en service : sous le verrou, il ne
      // devrait jamais sauter — s'il saute, c'est un doublon, pas une panne.
      if (isUniqueViolation(error)) {
        throw new WorkstationNameTakenError(row.name);
      }
      throw error;
    }
  }

  private async lock(): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new WorkstationMapLockOutsideTransactionError();
    }
    await this.prisma
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${WORKSTATION_MAP_LOCK}, 0))`;
  }
}
