import { Injectable, Logger } from "@nestjs/common";

import { currentRequestContext } from "../../../platform/context/request-context.store.js";
import { newTraceId } from "../../../platform/context/trace-context.js";
import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { buildActivityEventRow, type RecordActivityInput } from "../domain/activity-event.js";
import { ActivityRecorder } from "../domain/ports/activity-recorder.js";
import { ActorNamer } from "../domain/ports/actor-namer.js";

/**
 * Adaptateur Prisma du journal — écrit dans `growth.activity_events`.
 *
 * Complète l'entrée de l'émetteur avec le **contexte de requête** : id ULID
 * (`IdGenerator`), instant métier (`Clock`), `traceId` et `actorType` lus de
 * l'ALS (fallback `system` + trace neuve hors requête, pour un émetteur cron).
 *
 * **Best-effort + idempotent**, comme l'exige le port : un doublon (même
 * `idempotencyKey`, émission rejouée) est un **no-op silencieux** ; toute autre
 * panne est **journalisée puis avalée** — jamais propagée à l'appelant, pour ne
 * pas casser la transaction métier qui a déclenché l'événement.
 */
@Injectable()
export class PrismaActivityRecorder extends ActivityRecorder {
  private readonly logger = new Logger(PrismaActivityRecorder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly actors: ActorNamer,
  ) {
    super();
  }

  async record(input: RecordActivityInput): Promise<void> {
    const context = currentRequestContext();
    const actorType = context?.actor.type ?? "system";
    const actorId = context?.actor.id ?? null;
    const row = buildActivityEventRow(input, {
      id: this.ids.next(),
      now: this.clock.now(),
      traceId: context?.traceId ?? newTraceId(),
      actorType,
      actorId,
      // Figé ici, pas résolu à la lecture : le journal doit dire qui a agi ce
      // jour-là, pas qui porte ce nom aujourd'hui.
      actorName: await this.nameOrNull(actorType, actorId),
    });
    try {
      await this.prisma.activityEvent.create({
        data: { ...row, payload: row.payload as Prisma.InputJsonValue },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return; // déjà journalisé (émission rejouée) — idempotent, rien à faire.
      }
      // Best-effort : un échec d'append ne casse JAMAIS la transaction métier.
      this.logger.warn(`activity_event non journalisé (${input.type}) : ${messageOf(error)}`);
    }
  }

  /**
   * Le nom, ou rien. L'annuaire est **best-effort comme le reste du journal** :
   * une panne de résolution ne doit pas empêcher d'écrire le fait lui-même —
   * un événement sans nom vaut infiniment mieux qu'un événement perdu.
   */
  private async nameOrNull(
    type: "customer" | "staff" | "system",
    id: string | null,
  ): Promise<string | null> {
    try {
      return await this.actors.nameOf(type, id);
    } catch {
      return null;
    }
  }
}

/** Vrai si l'erreur est une violation d'unicité Prisma (P2002), sans importer ses classes. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const name: unknown = Reflect.get(error, "name");
  const code: unknown = Reflect.get(error, "code");
  return name === "PrismaClientKnownRequestError" && code === "P2002";
}

/** Message lisible d'une erreur inconnue, sans exposer la stack. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
