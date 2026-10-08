import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  CollectionNotYetOpenError,
  NothingToCollectError,
} from "../../domain/errors/collection-errors.js";
import {
  CollectionAutopilotRanEvent,
  type AutopilotIssue,
} from "../../domain/events/collection-autopilot.events.js";
import {
  AutoCollectionEntitiesReader,
  type AutoCollectionEntity,
} from "../../domain/ports/auto-collection-entities.reader.js";
import { AutomaticCollectionConstituter } from "../../domain/ports/automatic-collection-constituter.js";
import { CollectionAutopilotRuns } from "../../domain/ports/collection-autopilot-runs.js";
import { autopilotTurn } from "../../domain/services/collection-autopilot.js";
import {
  RunCollectionAutopilotCommand,
  type AutopilotRunReport,
  type CollectionAutopilotReport,
} from "./run-collection-autopilot.command.js";

/** Une constitution qui n'a fait qu'écarter : aucun lot, rien à annoncer. */
const ONLY_EXCLUSIONS =
  "Aucun lot : les commandes du mois ont toutes été écartées. Leurs raisons sont à l'écran « Prélèvement du mois ».";

/**
 * **Le passage de la constitution automatique** (plan
 * `prelevement-automatique.md`, PA3).
 *
 * Pour chaque entité dont l'automatisme est activé et dont l'heure de
 * constitution prévue (clôture + délai) est passée : si le cycle n'a jamais
 * été tenté, UNE tentative — la même constitution que le bouton, sous
 * l'auteur `system`, avis compris (PA2). Son issue est rangée et journalisée.
 *
 * ## Le passage se tait
 *
 * Il tourne toutes les heures ; un cycle déjà tenté ne coûte qu'une lecture —
 * ni assemblage, ni verrou, ni erreur (`vitruve`, § 8 : « 720 erreurs par
 * mois »). Annuler le lot ne relance pas l'automatisme : reconstituer est un
 * geste humain, après correction.
 *
 * ## Une tentative, pas une boucle
 *
 * Un refus n'est pas retenté au passage suivant. Il est rangé (`failed` et
 * son message, ou `nothing_to_collect`, `not_yet_open`), journalisé, et
 * l'écran le montre : le geste manuel reste ouvert. Rien n'est avalé.
 */
@CommandHandler(RunCollectionAutopilotCommand)
export class RunCollectionAutopilotHandler implements ICommandHandler<
  RunCollectionAutopilotCommand,
  CollectionAutopilotReport
> {
  private readonly logger = new Logger(RunCollectionAutopilotHandler.name);

  constructor(
    private readonly entities: AutoCollectionEntitiesReader,
    private readonly runs: CollectionAutopilotRuns,
    private readonly constituter: AutomaticCollectionConstituter,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(): Promise<CollectionAutopilotReport> {
    const now = this.clock.now();
    const reports: AutopilotRunReport[] = [];
    for (const entity of await this.entities.enabled()) {
      const report = await this.turn(entity, now);
      if (report !== null) {
        reports.push(report);
      }
    }
    return { runs: reports };
  }

  /** Le tour d'une entité : `null` quand il n'y avait rien à tenter. */
  private async turn(entity: AutoCollectionEntity, now: Date): Promise<AutopilotRunReport | null> {
    const { legalEntityId } = entity;
    const turn = autopilotTurn(now, entity.autoCollectionDelayHours);
    if (!turn.due || (await this.runs.attempted(legalEntityId, turn.cycleClosesAt))) {
      return null;
    }
    // La trace d'abord : c'est l'insertion qui décide qui tente.
    if (!(await this.runs.claim(legalEntityId, turn.cycleClosesAt, now))) {
      return null;
    }
    const issue = await this.attempt(legalEntityId);
    await this.uow.run(async () => {
      await this.runs.settle(legalEntityId, turn.cycleClosesAt, issue.outcome, issue.message);
      await this.events.publishTraced(
        new CollectionAutopilotRanEvent(
          { id: legalEntityId, name: entity.name },
          turn.cycleClosesAt,
          issue,
          now,
        ),
      );
    });
    return {
      legalEntityId,
      cycleClosesAt: turn.cycleClosesAt.toISOString(),
      outcome: issue.outcome,
    };
  }

  private async attempt(legalEntityId: string): Promise<AutopilotIssue> {
    try {
      const batchIds = await this.constituter.constitute(legalEntityId);
      return batchIds.length > 0
        ? { outcome: "constituted", batchCount: batchIds.length, message: null }
        : { outcome: "nothing_to_collect", batchCount: 0, message: ONLY_EXCLUSIONS };
    } catch (error) {
      return this.refusal(legalEntityId, error);
    }
  }

  /** Un refus rangé : les deux attendus ont leur issue, le reste est un échec. */
  private refusal(legalEntityId: string, error: unknown): AutopilotIssue {
    if (error instanceof NothingToCollectError) {
      return { outcome: "nothing_to_collect", batchCount: 0, message: error.message };
    }
    if (error instanceof CollectionNotYetOpenError) {
      return { outcome: "not_yet_open", batchCount: 0, message: error.message };
    }
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error({ message: "collection_autopilot_failed", legalEntityId, error: message });
    return { outcome: "failed", batchCount: 0, message };
  }
}
