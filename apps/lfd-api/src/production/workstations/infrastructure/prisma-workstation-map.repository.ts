import { Injectable } from "@nestjs/common";

import { PLACEMENT_SELECT, type PlacementRow, placementsOf } from "./placement-rows.js";
import { trackingLevelOrNull } from "./tracking-level-column.js";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  type PlacementChange,
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
  readonly trackingLevel: string | null;
}

function toDomain(
  stations: readonly WorkstationRow[],
  placements: readonly PlacementRow[],
): WorkstationMap {
  const state: WorkstationMapState = {
    workstations: stations.map((row) => ({
      ...row,
      trackingLevel: trackingLevelOrNull(row.trackingLevel),
    })),
    placements: placementsOf(placements),
  };
  return WorkstationMap.rehydrate(state);
}

/**
 * L'ordre d'écriture des lignes changées : les suppressions, puis les postes
 * qui ne finissent pas, puis ceux qui finissent. L'index unique partiel
 * (au plus un poste qui finit par produit) se juge à chaque instruction :
 * le poste qui finit désormais ne s'écrit qu'après que l'ancien a cessé.
 */
function writeOrder(change: PlacementChange): number {
  if (change.station === null) {
    return 0;
  }
  return change.station.finishes ? 2 : 1;
}

function toPersistence(station: Workstation, stamp: WorkstationMapStamp) {
  return {
    id: station.id,
    name: station.name,
    position: station.position,
    archivedAt: station.archivedAt,
    trackingLevel: station.trackingLevel,
    updatedAt: stamp.at,
    updatedByStaffId: stamp.staffUserId,
    updatedByName: stamp.name,
  };
}

/**
 * Le dépôt de la carte des postes (`documentation/fournil/les-postes-du-fournil.md`,
 * § 3.3). Le chargement prend `pg_advisory_xact_lock` sur la carte, tenu
 * jusqu'au `COMMIT` : deux gestes concurrents se suivent, et les règles de
 * l'agrégat (nom unique, poste vide avant l'archivage, poste en service)
 * restent vraies. La sauvegarde n'écrit que la différence.
 *
 * Un poste qui quitte un produit perd sa ligne (produit, poste) : une ligne
 * n'est pas un agrégat, elle dit seulement « ce produit passe à ce poste, à
 * cette place, et le finit ou non » ; un produit sans ligne est « à ranger »
 * — la place s'en va avec elle. Réordonner réécrit les lignes
 * dont la place change, à l'instant du geste : le numéro de la carte
 * (`WorkstationMapVersion`) monte, et la fiche gardée se refait. Le
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
        select: { id: true, name: true, position: true, archivedAt: true, trackingLevel: true },
      }),
      this.prisma.productionWorkstationProduct.findMany({
        select: PLACEMENT_SELECT,
      }),
    ]);
    return toDomain(stations, placements);
  }

  async save(map: WorkstationMap, stamp: WorkstationMapStamp): Promise<void> {
    const { workstations, placements } = map.changes();
    for (const station of workstations) {
      await this.writeStation(toPersistence(station, stamp));
    }
    const ordered = [...placements].sort((left, right) => writeOrder(left) - writeOrder(right));
    for (const change of ordered) {
      await this.writePlacement(change, stamp);
    }
  }

  private async writePlacement(change: PlacementChange, stamp: WorkstationMapStamp): Promise<void> {
    const key = { productSku: change.productSku, workstationId: change.workstationId };
    if (change.station === null) {
      await this.prisma.productionWorkstationProduct.deleteMany({ where: key });
      return;
    }
    const row = {
      finishes: change.station.finishes,
      position: change.station.position,
      updatedAt: stamp.at,
      updatedByStaffId: stamp.staffUserId,
      updatedByName: stamp.name,
    };
    await this.prisma.productionWorkstationProduct.upsert({
      where: { productSku_workstationId: key },
      create: { ...key, ...row },
      update: row,
    });
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
