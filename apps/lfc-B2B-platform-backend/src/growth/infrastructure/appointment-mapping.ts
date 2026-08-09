import type {
  AppointmentChannel,
  AppointmentStatus,
  AppointmentSubjectType,
  AppointmentView,
} from "@lfd/contracts";

import { Appointment } from "../domain/entities/appointment.js";
import { instantToLocal } from "../domain/paris-time.js";

/**
 * Traduction ligne `appointments` ↔ agrégat / vue. Les colonnes `status`,
 * `channel` et `subject_type` sont du texte libre côté SQL (pas d'enum Postgres,
 * comme pour `leads`) : on **renarrow** ici plutôt que de faire confiance à la
 * base, sinon un `as` mensonger se propagerait jusqu'au front.
 */

const STATUSES: readonly AppointmentStatus[] = [
  "requested",
  "confirmed",
  "honored",
  "no_show",
  "cancelled",
];

/** États qui **occupent** le créneau — un annulé l'a libéré. */
export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "requested",
  "confirmed",
  "honored",
  "no_show",
];

const CHANNELS: readonly AppointmentChannel[] = ["phone", "visio", "onsite"];
const SUBJECT_TYPES: readonly AppointmentSubjectType[] = ["company", "lead", "user"];

/** Forme d'une ligne `appointments` lue par Prisma (colonnes projetées). */
export interface AppointmentRow {
  readonly id: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly status: string;
  readonly channel: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly message: string;
  readonly cancelReason: string;
  readonly rescheduledFromId: string | null;
  readonly createdAt: Date;
}

function isStatus(value: string): value is AppointmentStatus {
  return (STATUSES as readonly string[]).includes(value);
}

function isChannel(value: string): value is AppointmentChannel {
  return (CHANNELS as readonly string[]).includes(value);
}

function isSubjectType(value: string): value is AppointmentSubjectType {
  return (SUBJECT_TYPES as readonly string[]).includes(value);
}

export function toAppointmentStatus(value: string): AppointmentStatus {
  return isStatus(value) ? value : "requested";
}

export function toAppointmentChannel(value: string): AppointmentChannel {
  return isChannel(value) ? value : "phone";
}

export function toSubjectType(value: string): AppointmentSubjectType {
  return isSubjectType(value) ? value : "user";
}

/** Reconstitue l'agrégat depuis une ligne (pour la mutation). */
export function rowToAppointment(row: AppointmentRow): Appointment {
  return Appointment.reconstitute({
    id: row.id,
    startAt: row.startAt,
    endAt: row.endAt,
    status: toAppointmentStatus(row.status),
    channel: toAppointmentChannel(row.channel),
    subjectType: toSubjectType(row.subjectType),
    subjectId: row.subjectId,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    message: row.message,
    cancelReason: row.cancelReason,
    rescheduledFromId: row.rescheduledFromId,
    createdAt: row.createdAt,
  });
}

/**
 * Mappe une ligne vers la vue plate. La **lecture locale** (`day`, `time`) est
 * calculée ici, côté serveur : c'est ce qui garantit que le SSR, le navigateur du
 * client et l'écran du commercial affichent tous la même heure, quel que soit le
 * fuseau de leur machine.
 */
export function rowToAppointmentView(row: AppointmentRow): AppointmentView {
  const local = instantToLocal(row.startAt);
  const localEnd = instantToLocal(row.endAt);
  return {
    id: row.id,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    day: local.day,
    time: local.time,
    endTime: localEnd.time,
    status: toAppointmentStatus(row.status),
    channel: toAppointmentChannel(row.channel),
    subjectType: toSubjectType(row.subjectType),
    subjectId: row.subjectId,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    message: row.message,
    cancelReason: row.cancelReason,
    rescheduledFromId: row.rescheduledFromId,
    createdAt: row.createdAt.toISOString(),
  };
}
