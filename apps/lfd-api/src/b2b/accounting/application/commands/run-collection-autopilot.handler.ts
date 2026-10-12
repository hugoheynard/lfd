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
import { AutopilotCoverageReader } from "../../domain/ports/autopilot-coverage.reader.js";
import { AutomaticCollectionConstituter } from "../../domain/ports/automatic-collection-constituter.js";
import { BillingRhythmReader } from "../../domain/ports/billing-rhythm.reader.js";
import { CollectionAutopilotRuns } from "../../domain/ports/collection-autopilot-runs.js";
import { autopilotTurn } from "../../domain/services/collection-autopilot.js";
import type { RhythmTimeline } from "../../domain/services/invoicing-closures.js";
import { missedClosures, missedClosuresMessage } from "../../domain/services/missed-closures.js";
import {
  RunCollectionAutopilotCommand,
  type AutopilotRunReport,
  type CollectionAutopilotReport,
} from "./run-collection-autopilot.command.js";

/** Une constitution qui n'a fait qu'écarter : aucun lot, rien à annoncer. */
const ONLY_EXCLUSIONS =
  "Aucun lot : les commandes de la période ont toutes été écartées. Leurs raisons sont à l'écran « Prélèvement du mois ».";

/**
 * **Le passage de la constitution automatique** (plan
 * `prelevement-automatique.md`, PA3).
 *
 * Pour chaque entité dont l'automatisme est activé et dont l'heure de
 * constitution prévue (dernière clôture de SON rythme + délai, R4) est passée : si le cycle n'a jamais
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
 *
 * ## Une clôture manquée suspend l'automatisme (R4b)
 *
 * Si une clôture antérieure de l'entité n'a jamais été tentée ni couverte
 * par un lot (passage arrêté, panne), le passage ne constitue PAS : il range
 * la tentative `missed`, son message nomme les clôtures, et la journalise.
 * Le lot manqué n'est jamais absorbé en silence par le suivant ; « Préparer
 * le lot » le refait, et l'automatisme reprend au cycle d'après (plan
 * `plan-rythme-de-facturation.md`, §14).
 */
@CommandHandler(RunCollectionAutopilotCommand)
export class RunCollectionAutopilotHandler implements ICommandHandler<
  RunCollectionAutopilotCommand,
  CollectionAutopilotReport
> {
  private readonly logger = new Logger(RunCollectionAutopilotHandler.name);

  constructor(
    private readonly entities: AutoCollectionEntitiesReader,
    private readonly rhythms: BillingRhythmReader,
    private readonly runs: CollectionAutopilotRuns,
    private readonly coverage: AutopilotCoverageReader,
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
    const setting = await this.rhythms.timelineOf(legalEntityId);
    if (setting === null) {
      return null;
    }
    const turn = autopilotTurn(now, entity.autoCollectionDelayHours, setting);
    if (!turn.due || (await this.runs.attempted(legalEntityId, turn.cycleClosesAt))) {
      return null;
    }
    // La trace d'abord : c'est l'insertion qui décide qui tente.
    if (!(await this.runs.claim(legalEntityId, turn.cycleClosesAt, now))) {
      return null;
    }
    const issue = await this.issueOf(legalEntityId, turn.cycleClosesAt, setting);
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

  /** `missed` sans rien constituer si une clôture antérieure manque ; sinon la tentative. */
  private async issueOf(
    legalEntityId: string,
    cycleClosesAt: Date,
    timeline: RhythmTimeline,
  ): Promise<AutopilotIssue> {
    const coverage = await this.coverage.coverageOf(legalEntityId, cycleClosesAt);
    const missed = missedClosures(cycleClosesAt, timeline, coverage);
    if (missed.length > 0) {
      return { outcome: "missed", batchCount: 0, message: missedClosuresMessage(missed) };
    }
    return this.attempt(legalEntityId);
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
