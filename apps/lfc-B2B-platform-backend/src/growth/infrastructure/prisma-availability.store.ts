import { Injectable } from "@nestjs/common";
import {
  bookingPolicySchema,
  type AvailabilityConfigPayload,
  type AvailabilityExceptionView,
  type AvailabilityRuleView,
  type BookingPolicy,
} from "@lfd/contracts";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { IdGenerator } from "../../infra/id/id-generator.js";
import type { AvailabilityConfig } from "../domain/availability.js";
import { instantToLocal } from "../domain/paris-time.js";
import { AvailabilityStore } from "../domain/ports/availability.store.js";

/** Clé du singleton de politique — une ligne, jamais deux. */
const POLICY_ID = "SINGLETON";

/**
 * Adaptateur Prisma de la disponibilité. Trois tables lues ensemble, réécrites
 * **en une transaction** : une grille à moitié enregistrée afficherait des
 * créneaux que le commercial n'a pas voulus.
 *
 * Le jour d'une exception est stocké en colonne `DATE` : on le relit à midi
 * (`12:00` local) pour dériver son libellé `AAAA-MM-JJ`, ce qui le met hors de
 * portée de tout décalage de fuseau — à minuit, une heure d'écart changerait le jour.
 */
@Injectable()
export class PrismaAvailabilityStore extends AvailabilityStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async load(): Promise<AvailabilityConfig> {
    const [rules, exceptions, policy] = await Promise.all([
      this.prisma.availabilityRule.findMany({
        orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      }),
      this.prisma.availabilityException.findMany({ orderBy: { day: "asc" } }),
      this.prisma.bookingPolicySettings.findUnique({ where: { id: POLICY_ID } }),
    ]);
    return {
      rules: rules.map(toRuleView),
      exceptions: exceptions.map(toExceptionView),
      policy: toPolicy(policy),
    };
  }

  async replace(config: AvailabilityConfigPayload): Promise<AvailabilityConfig> {
    await this.prisma.$transaction([
      this.prisma.availabilityRule.deleteMany({}),
      this.prisma.availabilityException.deleteMany({}),
      this.prisma.availabilityRule.createMany({
        data: config.rules.map((rule) => ({ id: `avrule_${this.ids.next()}`, ...rule })),
      }),
      this.prisma.availabilityException.createMany({
        data: config.exceptions.map((exception) => ({
          id: `avexc_${this.ids.next()}`,
          day: dayToDate(exception.day),
          kind: exception.kind,
          startTime: exception.startTime,
          endTime: exception.endTime,
          reason: exception.reason,
        })),
      }),
      this.prisma.bookingPolicySettings.upsert({
        where: { id: POLICY_ID },
        create: { id: POLICY_ID, ...config.policy },
        update: config.policy,
      }),
    ]);
    return this.load();
  }

  async savePolicy(policy: BookingPolicy): Promise<AvailabilityConfig> {
    await this.prisma.bookingPolicySettings.upsert({
      where: { id: POLICY_ID },
      create: { id: POLICY_ID, ...policy },
      update: policy,
    });
    return this.load();
  }
}

/** Le jour local `AAAA-MM-JJ` vers la colonne `DATE` (midi UTC, hors DST). */
function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

/** L'inverse : une colonne `DATE` relue en jour local. */
function dateToDay(date: Date): string {
  return instantToLocal(date).day;
}

function toRuleView(row: {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}): AvailabilityRuleView {
  return { id: row.id, weekday: row.weekday, startTime: row.startTime, endTime: row.endTime };
}

function toExceptionView(row: {
  id: string;
  day: Date;
  kind: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
}): AvailabilityExceptionView {
  return {
    id: row.id,
    day: dateToDay(row.day),
    kind: row.kind === "open" ? "open" : "closed",
    startTime: row.startTime,
    endTime: row.endTime,
    reason: row.reason,
  };
}

/**
 * La politique, ou ses **défauts** si le singleton n'a jamais été écrit — c'est
 * le schéma Zod qui les porte, pour qu'ils ne soient définis qu'à un seul endroit.
 */
function toPolicy(
  row: {
    slotMinutes: number;
    leadTimeHours: number;
    horizonDays: number;
    channels: string[];
  } | null,
): BookingPolicy {
  const parsed = bookingPolicySchema.safeParse(row ?? {});
  return parsed.success ? parsed.data : bookingPolicySchema.parse({});
}
