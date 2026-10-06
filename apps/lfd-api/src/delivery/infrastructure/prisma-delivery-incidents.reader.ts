import { DELIVERY_INCIDENT_FAMILIES, type DeliveryIncidentFamily } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type DeliveryIncidentRow,
  DeliveryIncidentsReader,
} from "../domain/ports/delivery-incidents.reader.js";
import {
  type IncidentPhotoRef,
  IncidentPhotosReader,
} from "../domain/ports/incident-photos.reader.js";

const INCIDENT_SELECT = {
  id: true,
  roundId: true,
  stopId: true,
  family: true,
  reason: true,
  note: true,
  photoKey: true,
  reportedAt: true,
  reportedBy: true,
  reportedByName: true,
} as const;

interface IncidentRecord {
  readonly id: string;
  readonly roundId: string;
  readonly stopId: string | null;
  readonly family: string;
  readonly reason: string;
  readonly note: string;
  readonly photoKey: string | null;
  readonly reportedAt: Date;
  readonly reportedBy: string;
  readonly reportedByName: string;
}

/**
 * **Adaptateur Prisma de lecture des signalements** (`a-la-porte.md`,
 * § 3, AP-D7). Il ne lit que les tables de la livraison : le signalement, et
 * le numéro de commande que le départ a figé sur l'arrêt.
 */
@Injectable()
export class PrismaDeliveryIncidentsReader extends DeliveryIncidentsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofDay(day: string): Promise<readonly DeliveryIncidentRow[]> {
    const rows = await this.prisma.deliveryIncident.findMany({
      where: { serviceDay: day },
      orderBy: [{ reportedAt: "asc" }, { id: "asc" }],
      select: INCIDENT_SELECT,
    });
    return this.withReferences(rows);
  }

  async ofRounds(roundIds: readonly string[]): Promise<readonly DeliveryIncidentRow[]> {
    if (roundIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.deliveryIncident.findMany({
      where: { roundId: { in: [...roundIds] } },
      orderBy: [{ reportedAt: "asc" }, { id: "asc" }],
      select: INCIDENT_SELECT,
    });
    return this.withReferences(rows);
  }

  /** Le numéro de commande figé au départ de chaque arrêt cité, en une requête. */
  private async withReferences(
    rows: readonly IncidentRecord[],
  ): Promise<readonly DeliveryIncidentRow[]> {
    const stopIds = [...new Set(rows.flatMap((row) => (row.stopId === null ? [] : [row.stopId])))];
    const executions =
      stopIds.length === 0
        ? []
        : await this.prisma.deliveryStopExecution.findMany({
            where: { stopId: { in: stopIds } },
            select: { stopId: true, reference: true },
          });
    const references = new Map(executions.map((row) => [row.stopId, row.reference]));
    return rows.map((row) => ({
      id: row.id,
      roundId: row.roundId,
      stopId: row.stopId,
      orderReference: row.stopId === null ? null : (references.get(row.stopId) ?? null),
      family: familyOf(row.family),
      reason: row.reason,
      note: row.note,
      hasPhoto: row.photoKey !== null,
      reportedAt: row.reportedAt,
      reportedBy: row.reportedBy,
      reportedByName: row.reportedByName,
    }));
  }
}

/**
 * La photo d'un signalement — à part des listes (ISP). Même table, même
 * adaptateur de lecture que les listes, une classe par port.
 */
@Injectable()
export class PrismaIncidentPhotosReader extends IncidentPhotosReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async photoOf(incidentId: string): Promise<IncidentPhotoRef | null> {
    const row = await this.prisma.deliveryIncident.findUnique({
      where: { id: incidentId },
      select: { roundId: true, photoKey: true },
    });
    if (row === null || row.photoKey === null) {
      return null;
    }
    return { roundId: row.roundId, photoKey: row.photoKey };
  }
}

/**
 * La colonne est un `varchar` sous un `CHECK` : une valeur hors de la liste
 * n'a pas pu s'écrire. La relire sans `as` quand même — et la ramener à la
 * famille la plus large, `technical`, plutôt que d'inventer une remise.
 */
function familyOf(raw: string): DeliveryIncidentFamily {
  return DELIVERY_INCIDENT_FAMILIES.find((family) => family === raw) ?? "technical";
}
