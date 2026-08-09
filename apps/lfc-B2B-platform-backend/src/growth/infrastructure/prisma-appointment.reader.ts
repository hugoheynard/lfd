import { Injectable } from "@nestjs/common";
import type { AppointmentView } from "@lfd/contracts";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { AppointmentReader } from "../domain/ports/appointment.reader.js";
import { ACTIVE_APPOINTMENT_STATUSES, rowToAppointmentView } from "./appointment-mapping.js";

/** Colonnes lues pour la vue plate (les mêmes que l'agrégat — une seule ligne). */
const VIEW_SELECT = {
  id: true,
  startAt: true,
  endAt: true,
  status: true,
  channel: true,
  subjectType: true,
  subjectId: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  message: true,
  cancelReason: true,
  rescheduledFromId: true,
  createdAt: true,
} as const;

/** Adaptateur Prisma de lecture des rendez-vous (file staff + « mes rendez-vous »). */
@Injectable()
export class PrismaAppointmentReader extends AppointmentReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listBetween(from: Date, to: Date): Promise<readonly AppointmentView[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { startAt: { gte: from, lt: to } },
      orderBy: { startAt: "asc" },
      select: VIEW_SELECT,
    });
    return rows.map(rowToAppointmentView);
  }

  async listUpcomingFor(
    subjectType: string,
    subjectIds: readonly string[],
    now: Date,
  ): Promise<readonly AppointmentView[]> {
    if (subjectIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.appointment.findMany({
      where: {
        subjectType,
        subjectId: { in: [...subjectIds] },
        // « À venir » se compte sur la FIN : un rendez-vous commencé n'est pas
        // encore passé, et c'est celui-là que le client cherche à retrouver.
        endAt: { gte: now },
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      },
      orderBy: { startAt: "asc" },
      select: VIEW_SELECT,
    });
    return rows.map(rowToAppointmentView);
  }
}
