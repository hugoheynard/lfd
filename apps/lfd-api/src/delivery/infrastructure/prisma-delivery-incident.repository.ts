import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { DeliveryIncident } from "../domain/entities/delivery-incident.js";
import { DeliveryIncidentRepository } from "../domain/ports/delivery-incident.repository.js";

/**
 * **Adaptateur Prisma des signalements** (`a-la-porte.md`, § 3). SEUL
 * écrivain de `delivery_incident`, qui n'a qu'un geste : ajouter. Aucune
 * ligne n'est réécrite ni supprimée.
 */
@Injectable()
export class PrismaDeliveryIncidentRepository extends DeliveryIncidentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(incident: DeliveryIncident): Promise<void> {
    const state = incident.toSnapshot();
    await this.prisma.deliveryIncident.create({
      data: {
        id: state.id,
        roundId: state.roundId,
        stopId: state.stopId,
        serviceDay: state.serviceDay,
        family: state.family,
        reason: state.reason,
        note: state.note,
        photoKey: state.photoKey,
        reportedAt: state.reportedAt,
        reportedBy: state.reportedBy,
        reportedByName: state.reportedByName,
      },
    });
  }
}
