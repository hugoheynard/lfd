import type { PublicPickupScheduleView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PublicPickupScheduleReader } from "../domain/public-pickup-schedule.reader.js";
import { dateToDay, weekdayOfColumn } from "./public-pickup-schedule-rows.js";

/**
 * Adaptateur de **lecture** de l'horaire public d'un point.
 *
 * Séparé de l'adaptateur d'écriture parce que les ports le sont (ISP) : ce
 * chemin rend la vue du contrat, identifiants compris, et n'a aucun agrégat à
 * rehydrater — une lecture n'a pas d'invariant à tenir.
 *
 * Un point non réglé rend deux listes vides, et c'est l'état de tous les points
 * avant ce chantier.
 */
@Injectable()
export class PrismaPublicPickupScheduleReader extends PublicPickupScheduleReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(pickupAddressId: string): Promise<PublicPickupScheduleView> {
    const [rules, closures] = await Promise.all([
      this.prisma.publicPickupSlotRule.findMany({
        where: { pickupAddressId },
        orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
        select: {
          id: true,
          weekday: true,
          startTime: true,
          endTime: true,
          slotMinutes: true,
          badge: true,
          serviceCapacity: true,
        },
      }),
      this.prisma.publicPickupClosure.findMany({
        where: { pickupAddressId },
        orderBy: [{ fromDay: "asc" }],
        select: {
          id: true,
          fromDay: true,
          toDay: true,
          startTime: true,
          endTime: true,
          reason: true,
        },
      }),
    ]);
    return {
      rules: rules.map((rule) => ({ ...rule, weekday: weekdayOfColumn(rule.weekday) })),
      closures: closures.map((closure) => ({
        ...closure,
        fromDay: dateToDay(closure.fromDay),
        toDay: dateToDay(closure.toDay),
      })),
    };
  }
}
