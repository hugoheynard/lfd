import { Injectable } from "@nestjs/common";

import { Prisma } from "../database/client/client.js";
import { isJsonRecord } from "../database/json-columns.js";
import { PrismaService } from "../database/prisma.service.js";
import { IdGenerator } from "../id/id-generator.js";
import {
  GESTURE_INTENT_LEASE_MS,
  type GestureIntent,
  GestureIntentLedger,
  type IntentClaim,
  type IntentRecord,
} from "./gesture-intent.js";
import { IntentRecordUnreadableError } from "./intent-errors.js";

/** Code Postgres d'une violation de contrainte unique. */
const UNIQUE_VIOLATION = "P2002";

/**
 * Adaptateur Prisma du registre des intentions — la mécanique de
 * `PrismaOrderIdempotencyStore` : on INSÈRE d'abord, et c'est le refus de
 * l'index unique qui apprend que quelqu'un est déjà passé.
 */
@Injectable()
export class PrismaGestureIntentLedger extends GestureIntentLedger {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async claim(intent: GestureIntent, now: Date): Promise<IntentClaim> {
    try {
      await this.prisma.gestureIntent.create({
        data: {
          id: this.ids.next(),
          actorId: intent.actorId,
          key: intent.key,
          gesture: intent.gesture,
          subject: intent.subject,
          claimedAt: now,
        },
        select: { id: true },
      });
      return { kind: "claimed" };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      return this.decideOnExisting(intent, now);
    }
  }

  /** L'empreinte se juge AVANT le bail : une intention abandonnée ne se reprend pas pour un autre geste. */
  private async decideOnExisting(intent: GestureIntent, now: Date): Promise<IntentClaim> {
    const held = await this.prisma.gestureIntent.findUnique({
      where: { actorId_key: { actorId: intent.actorId, key: intent.key } },
      select: { gesture: true, subject: true, claimedAt: true, resolvedAt: true, result: true },
    });
    if (held === null) {
      // Rendue entre l'insertion refusée et cette lecture : on retente.
      return this.claim(intent, now);
    }
    if (held.gesture !== intent.gesture || held.subject !== intent.subject) {
      return { kind: "mismatch" };
    }
    if (held.resolvedAt !== null) {
      return { kind: "replayed", result: toRecord(held.result, intent.gesture) };
    }
    if (now.getTime() - held.claimedAt.getTime() < GESTURE_INTENT_LEASE_MS) {
      return { kind: "in_flight" };
    }
    // REPRISE, conditionnée : si l'appel d'origine a abouti entre-temps, rien
    // ne matche et on relit plutôt que d'écraser.
    const { count } = await this.prisma.gestureIntent.updateMany({
      where: {
        actorId: intent.actorId,
        key: intent.key,
        resolvedAt: null,
        claimedAt: held.claimedAt,
      },
      data: { claimedAt: now },
    });
    return count === 1 ? { kind: "claimed" } : this.decideOnExisting(intent, now);
  }

  async resolve(intent: GestureIntent, result: IntentRecord, now: Date): Promise<void> {
    await this.prisma.gestureIntent.updateMany({
      where: { actorId: intent.actorId, key: intent.key, resolvedAt: null },
      data: { resolvedAt: now, result: { ...result } },
    });
  }

  async release(intent: GestureIntent): Promise<void> {
    // Jamais une intention résolue : son geste a eu lieu.
    await this.prisma.gestureIntent.deleteMany({
      where: { actorId: intent.actorId, key: intent.key, resolvedAt: null },
    });
  }
}

/** Un résultat gardé, vérifié champ à champ. */
function toRecord(value: unknown, gesture: string): IntentRecord {
  if (!isJsonRecord(value)) {
    throw new IntentRecordUnreadableError(gesture, "result");
  }
  const record: Record<string, string | boolean | null> = {};
  for (const [field, entry] of Object.entries(value)) {
    if (entry !== null && typeof entry !== "string" && typeof entry !== "boolean") {
      throw new IntentRecordUnreadableError(gesture, field);
    }
    record[field] = entry;
  }
  return record;
}

/** Une violation d'unicité, reconnue sans dépendre du message. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
}
