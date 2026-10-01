import { Injectable } from "@nestjs/common";

import { Prisma } from "../../platform/database/client/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import type { DepartedStop } from "../domain/entities/departure-sheet.js";
import { DepartedStopRepository } from "../domain/ports/departed-stop.repository.js";

/**
 * **Adaptateur Prisma de l'exécution au départ** (lot 4, « snapshot au
 * départ »). SEUL écrivain de `delivery_stop_execution` (C10) ; une ligne par
 * arrêt, écrite dans la transaction de « Partir », jamais réécrite à ce lot.
 *
 * Depuis le 2026-10-01, il fige aussi le rang de passage et le point GPS du
 * carnet (plan « Ma tournée », MT-D5 v2), et « dépôt autorisé » (plan « À la
 * porte », AP-D5), et la décision réglée d'avance résolue (B3 bis). Il n'écrit JAMAIS `arrived_at` : c'est la porte
 * (`PrismaStopArrivalRepository`) qui l'écrit, une fois.
 *
 * `DbNull` et non `JsonNull` : une commande sans adresse, sans contact ou sans
 * fenêtre n'en a PAS — ce n'est pas un `null` JSON stocké.
 */
@Injectable()
export class PrismaDepartedStopRepository extends DepartedStopRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(stops: readonly DepartedStop[]): Promise<void> {
    if (stops.length === 0) {
      return;
    }
    await this.prisma.deliveryStopExecution.createMany({
      data: stops.map(({ sheet, ...stop }) => ({
        stopId: stop.stopId,
        roundId: stop.roundId,
        orderId: sheet.orderId,
        serviceDay: stop.serviceDay,
        departedAt: stop.departedAt,
        reference: sheet.reference,
        customerLabel: sheet.customerLabel,
        address: sheet.address === null ? Prisma.DbNull : { ...sheet.address },
        contact: sheet.contact === null ? Prisma.DbNull : { ...sheet.contact },
        deliveryWindow: sheet.window === null ? Prisma.DbNull : { ...sheet.window },
        signatureRequired: sheet.signatureRequired,
        note: sheet.note,
        addressNote: sheet.addressNote,
        depositAllowed: sheet.depositAllowed,
        doorstepRule: stop.doorstepRule,
        departureRank: stop.departureRank,
        gpsLat: stop.gps?.lat ?? null,
        gpsLng: stop.gps?.lng ?? null,
      })),
    });
  }
}
