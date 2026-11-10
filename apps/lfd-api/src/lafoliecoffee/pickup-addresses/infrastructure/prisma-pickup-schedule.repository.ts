import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PickupSchedule } from "../domain/pickup-schedule.js";
import { PickupScheduleRepository } from "../domain/pickup-schedule.repository.js";
import { dateToDay, dayToDate, weekdayOfColumn } from "./public-pickup-schedule-rows.js";

/**
 * Adaptateur Prisma de l'horaire public d'un point.
 *
 * Il ne décide de rien — ni des chevauchements, ni des badges, ni des
 * capacités : il traduit l'agrégat en lignes. Les règles et les fermetures sont
 * **réécrites en bloc** dans une transaction, parce que c'est le geste que
 * l'agrégat expose (`replace`) et parce qu'une grille à moitié enregistrée
 * ouvrirait des heures que personne n'a voulues.
 *
 * Les identifiants sont posés **ici**, comme le fait `PrismaAvailabilityStore` :
 * une règle n'a pas d'identité métier, elle disparaît et renaît à chaque
 * enregistrement. Rien ne la référence — une réservation portera son heure, pas
 * un renvoi à la règle qui l'a produite (D10).
 */
@Injectable()
export class PrismaPickupScheduleRepository extends PickupScheduleRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async load(pickupAddressId: string): Promise<PickupSchedule> {
    const [rules, closures] = await Promise.all([
      this.prisma.publicPickupSlotRule.findMany({
        where: { pickupAddressId },
        orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
        select: {
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
          fromDay: true,
          toDay: true,
          startTime: true,
          endTime: true,
          reason: true,
        },
      }),
    ]);
    return PickupSchedule.reconstitute({
      pickupAddressId,
      rules: rules.map((rule) => ({ ...rule, weekday: weekdayOfColumn(rule.weekday) })),
      closures: closures.map((closure) => ({
        ...closure,
        fromDay: dateToDay(closure.fromDay),
        toDay: dateToDay(closure.toDay),
      })),
    });
  }

  async save(schedule: PickupSchedule): Promise<void> {
    const state = schedule.toPersistence();
    const wall = { pickupAddressId: state.pickupAddressId };
    await this.prisma.$transaction([
      this.prisma.publicPickupSlotRule.deleteMany({ where: wall }),
      this.prisma.publicPickupClosure.deleteMany({ where: wall }),
      this.prisma.publicPickupSlotRule.createMany({
        data: state.rules.map((rule) => ({
          id: `ppslot_${this.ids.next()}`,
          ...wall,
          ...rule,
        })),
      }),
      this.prisma.publicPickupClosure.createMany({
        data: state.closures.map((closure) => ({
          id: `ppclose_${this.ids.next()}`,
          ...wall,
          ...closure,
          fromDay: dayToDate(closure.fromDay),
          toDay: dayToDate(closure.toDay),
        })),
      }),
    ]);
  }
}
