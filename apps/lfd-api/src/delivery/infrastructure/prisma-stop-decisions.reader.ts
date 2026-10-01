import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DecisionIncidentPhotosReader } from "../domain/ports/decision-incident-photos.reader.js";
import type { IncidentPhotoRef } from "../domain/ports/incident-photos.reader.js";
import {
  type PendingDecisionRow,
  PendingDecisionsReader,
} from "../domain/ports/pending-decisions.reader.js";
import {
  type StopDecisionRow,
  StopDecisionsReader,
} from "../domain/ports/stop-decisions.reader.js";
import { outcomeOf, sourceOf } from "./stop-decision.mapper.js";

const DECISION_SELECT = {
  stopId: true,
  roundId: true,
  outcome: true,
  source: true,
  decidedAt: true,
  decidedByName: true,
} as const;

interface DecisionRecord {
  readonly stopId: string;
  readonly roundId: string;
  readonly outcome: string | null;
  readonly source: string | null;
  readonly decidedAt: Date | null;
  readonly decidedByName: string | null;
}

function rowOf(record: DecisionRecord): StopDecisionRow {
  return {
    stopId: record.stopId,
    roundId: record.roundId,
    outcome: outcomeOf(record.outcome),
    source: sourceOf(record.source),
    decidedAt: record.decidedAt,
    decidedByName: record.decidedByName,
  };
}

/** Les décisions d'une tournée, pour la carte du livreur (B3). Il n'écrit rien. */
@Injectable()
export class PrismaStopDecisionsReader extends StopDecisionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofRound(roundId: string): Promise<readonly StopDecisionRow[]> {
    const records = await this.prisma.deliveryStopDecision.findMany({
      where: { roundId },
      select: DECISION_SELECT,
    });
    return records.map(rowOf);
  }
}

/**
 * **« À décider »** (`plan-a-la-porte.md`, B3) — deux lectures des tables de
 * la livraison, sans jointure (aucune clé étrangère ne relie la décision à
 * l'arrêt) : les décisions non « rapportées », puis leurs arrêts encore
 * OUVERTS d'une tournée partie et non rentrée. Une décision dont l'arrêt est
 * clos, retiré, ou dont la tournée est rentrée, ne s'y lit pas.
 */
@Injectable()
export class PrismaPendingDecisionsReader extends PendingDecisionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pending(): Promise<readonly PendingDecisionRow[]> {
    const records = await this.prisma.deliveryStopDecision.findMany({
      where: { OR: [{ outcome: null }, { outcome: { not: "bring_back" } }] },
      select: DECISION_SELECT,
    });
    if (records.length === 0) {
      return [];
    }
    const decisions = new Map(records.map((record) => [record.stopId, rowOf(record)]));
    const stops = await this.prisma.deliveryRoundStop.findMany({
      where: {
        id: { in: [...decisions.keys()] },
        removedAt: null,
        closedAt: null,
        round: { departedAt: { not: null }, returnedAt: null },
      },
      orderBy: [{ serviceDay: "asc" }, { roundId: "asc" }, { position: "asc" }],
      select: {
        id: true,
        orderId: true,
        serviceDay: true,
        round: { select: { id: true, vehicleName: true, passage: true } },
        execution: {
          select: { reference: true, customerLabel: true, signatureRequired: true },
        },
      },
    });
    return stops.flatMap((stop) => {
      const decision = decisions.get(stop.id);
      return decision === undefined
        ? []
        : [
            {
              roundId: stop.round.id,
              vehicleName: stop.round.vehicleName,
              passage: stop.round.passage,
              serviceDay: stop.serviceDay,
              stopId: stop.id,
              orderId: stop.orderId,
              reference: stop.execution?.reference ?? "",
              customerLabel: stop.execution?.customerLabel ?? "",
              signatureRequired: stop.execution?.signatureRequired ?? false,
              decision,
            },
          ];
    });
  }
}

/**
 * La photo d'un signalement à décider — trois conditions dans les `where`
 * (B3) : le signalement est de CET arrêt et porte une photo ; l'arrêt a une
 * décision non rapportée ; il est ouvert, dans une tournée partie et non
 * rentrée. Une seule manque : `null`.
 */
@Injectable()
export class PrismaDecisionIncidentPhotosReader extends DecisionIncidentPhotosReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async photoOf(stopId: string, incidentId: string): Promise<IncidentPhotoRef | null> {
    const [incident, decision, stop] = await Promise.all([
      this.prisma.deliveryIncident.findFirst({
        where: { id: incidentId, stopId, photoKey: { not: null } },
        select: { roundId: true, photoKey: true },
      }),
      this.prisma.deliveryStopDecision.findFirst({
        where: { stopId, OR: [{ outcome: null }, { outcome: { not: "bring_back" } }] },
        select: { stopId: true },
      }),
      this.prisma.deliveryRoundStop.findFirst({
        where: {
          id: stopId,
          removedAt: null,
          closedAt: null,
          round: { departedAt: { not: null }, returnedAt: null },
        },
        select: { id: true },
      }),
    ]);
    if (incident?.photoKey == null || decision === null || stop === null) {
      return null;
    }
    return { roundId: incident.roundId, photoKey: incident.photoKey };
  }
}
