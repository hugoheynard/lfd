import { Injectable, Logger } from "@nestjs/common";

import { currentRequestContext } from "../../../platform/context/request-context.store.js";
import { newTraceId } from "../../../platform/context/trace-context.js";
import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { JournalFactCheck } from "../../../platform/journal/journal-fact-check.js";
import { Clock } from "../../../platform/time/clock.js";
import { buildActivityEventRow, type RecordActivityInput } from "../domain/activity-event.js";
import { ActivityRecorder } from "../domain/ports/activity-recorder.js";
import { ActorNamer, type ActorIdentity } from "../domain/ports/actor-namer.js";

/**
 * Adaptateur Prisma du journal — écrit dans `growth.activity_events`.
 *
 * Complète l'entrée de l'émetteur avec le **contexte de requête** : id ULID
 * (`IdGenerator`), instant métier (`Clock`), `traceId` et `actorType` lus de
 * l'ALS (fallback `system` + trace neuve hors requête, pour un émetteur cron).
 *
 * **Best-effort + idempotent**, comme l'exige le port : un doublon (même
 * `idempotencyKey`, émission rejouée) est un **no-op silencieux**, sans erreur
 * Postgres — donc sans avorter la transaction qui l'englobe ; toute autre
 * panne est **journalisée puis avalée** — jamais propagée à l'appelant, pour ne
 * pas casser la transaction métier qui a déclenché l'événement.
 *
 * **Le point unique où tout fait est confronté au catalogue**
 * (`@lfd/contracts/journal-facts`, D2 du plan des phrases du journal) : les
 * deux garanties, donc tous les chemins — le référentiel, les actes nommés,
 * l'annuaire, le miroir tarifaire (par `Journal.append`) et la croissance (en
 * direct) — passent par ici, et c'est le seul écrivain de `activity_events`
 * (vérifié le 2026-09-19). La vérification précède le `try` de `record` : en
 * mode strict, un fait hors catalogue lève même sur le chemin best-effort, sans
 * quoi un test ne verrait jamais l'écart.
 */
@Injectable()
export class PrismaActivityRecorder extends ActivityRecorder {
  private readonly logger = new Logger(PrismaActivityRecorder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly actors: ActorNamer,
    private readonly facts: JournalFactCheck,
  ) {
    super();
  }

  /**
   * Best-effort : la panne est journalisée puis avalée. Le fait hors catalogue,
   * lui, lève en mode strict (tests) — voir la classe.
   */
  async record(input: RecordActivityInput): Promise<void> {
    this.facts.verify(input.type, input.payload);
    try {
      await this.append(input);
    } catch (error) {
      this.logger.warn(`activity_event non journalisé (${input.type}) : ${messageOf(error)}`);
    }
  }

  /**
   * Bloquant : la panne remonte, et annule la transaction qui englobe l'appel.
   *
   * Rien de plus que `record` sans son `catch` — c'est bien le MÊME append, et
   * il faut que ce soit visible : deux chemins d'écriture divergeraient, et
   * c'est le chemin rare (celui qui doit être fiable) qui pourrirait en
   * silence.
   */
  async recordOrFail(input: RecordActivityInput): Promise<void> {
    this.facts.verify(input.type, input.payload);
    await this.append(input);
  }

  /**
   * L'append lui-même. Idempotent des deux côtés : un doublon (même
   * `idempotencyKey`, émission rejouée) est un no-op, jamais une erreur.
   */
  private async append(input: RecordActivityInput): Promise<void> {
    const context = currentRequestContext();
    const actorType = input.bySystem === true ? "system" : (context?.actor.type ?? "system");
    const actorId = input.bySystem === true ? null : (context?.actor.id ?? null);
    const actor = await this.describeOrNothing(actorType, actorId);
    const row = buildActivityEventRow(input, {
      id: this.ids.next(),
      now: this.clock.now(),
      traceId: context?.traceId ?? newTraceId(),
      actorType,
      actorId,
      // Figés ici, pas résolus à la lecture : le journal doit dire qui a agi ce
      // jour-là et à quel titre, pas qui porte ce nom et ce rôle aujourd'hui.
      actorName: actor.name,
      actorRole: actor.role,
    });
    // `skipDuplicates` = `INSERT … ON CONFLICT DO NOTHING` : un fait rejoué
    // (même `idempotency_key`) n'écrit rien, SANS erreur Postgres. Attraper le
    // P2002 après coup ne suffisait pas : dans une `UnitOfWork`, l'`INSERT`
    // refusé met la transaction en échec, et le geste qu'on voulait épargner
    // était annulé au commit (TODO du doublon, corrigé le 2026-09-18).
    await this.prisma.activityEvent.createMany({
      data: [{ ...row, payload: row.payload as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
  }

  /**
   * Le nom et la fonction, ou rien. L'annuaire est **best-effort comme le reste
   * du journal** : une panne de résolution ne doit pas empêcher d'écrire le fait
   * lui-même — un événement anonyme vaut infiniment mieux qu'un événement perdu.
   */
  private async describeOrNothing(
    type: "customer" | "staff" | "system",
    id: string | null,
  ): Promise<ActorIdentity> {
    try {
      return await this.actors.describe(type, id);
    } catch {
      return { name: null, role: null };
    }
  }
}

/** Message lisible d'une erreur inconnue, sans exposer la stack. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
