import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import type { BookedSlot } from "../domain/availability.js";
import type { Appointment } from "../domain/entities/appointment.js";
import { SlotAlreadyTakenError } from "../domain/errors/appointment-errors.js";
import { AppointmentRepository } from "../domain/ports/appointment.repository.js";
import { ACTIVE_APPOINTMENT_STATUSES, rowToAppointment } from "./appointment-mapping.js";

/** Colonnes lues pour reconstituer l'agrégat. */
const APPOINTMENT_SELECT = {
  id: true,
  startAt: true,
  endAt: true,
  status: true,
  channel: true,
  purpose: true,
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

/** Adaptateur Prisma de l'agrégat Appointment (écriture). Id ULID préfixé `appt_`. */
@Injectable()
export class PrismaAppointmentRepository extends AppointmentRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async create(appointment: Appointment): Promise<string> {
    const id = `appt_${this.ids.next()}`;
    try {
      await this.prisma.appointment.create({
        data: {
          id,
          startAt: appointment.startAt,
          endAt: appointment.endAt,
          status: appointment.status,
          channel: appointment.channel,
          purpose: appointment.purpose,
          subjectType: appointment.subjectType,
          subjectId: appointment.subjectId,
          contactName: appointment.contactName,
          contactEmail: appointment.contactEmail,
          contactPhone: appointment.contactPhone,
          message: appointment.message,
          rescheduledFromId: appointment.rescheduledFromId,
        },
      });
      return id;
    } catch (error) {
      // L'index unique PARTIEL a tranché la course : quelqu'un a réservé ce
      // créneau entre notre vérification et notre écriture. C'est un 409 lisible
      // (« choisissez-en un autre »), pas un 500.
      if (isUniqueViolation(error)) {
        throw new SlotAlreadyTakenError(appointment.startAt.toISOString());
      }
      throw error;
    }
  }

  async load(appointmentId: string): Promise<Appointment | null> {
    const row = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: APPOINTMENT_SELECT,
    });
    return row === null ? null : rowToAppointment(row);
  }

  async save(appointmentId: string, appointment: Appointment): Promise<void> {
    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: appointment.status, cancelReason: appointment.cancelReason },
    });
  }

  async bookedBetween(from: Date, to: Date): Promise<readonly BookedSlot[]> {
    // Chevauchement, pas inclusion : un rendez-vous qui déborde dans la fenêtre
    // occupe bien des créneaux de la fenêtre.
    const rows = await this.prisma.appointment.findMany({
      where: {
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: { startAt: true, endAt: true },
    });
    return rows;
  }
}

/**
 * Violation d'unicité Prisma (`P2002`) — duck-typée, sans importer le client
 * (même pattern que `customer-principal.resolver.ts`) : l'infrastructure ne doit pas
 * imposer un type de moteur au chemin d'erreur.
 */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "P2002";
}
