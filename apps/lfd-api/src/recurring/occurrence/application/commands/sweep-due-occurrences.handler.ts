import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { parisDay } from "../../../basket/application/services/paris-day.js";
import { BasketRepository } from "../../../basket/domain/ports/basket.repository.js";
import type { Basket } from "../../../basket/domain/entities/basket.js";
import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import {
  OccurrencePlacement,
  type OccurrencePlacementOutcome,
} from "../../../channels/commerce/occurrence-placement.js";
import {
  RecurringOccurrenceFact,
  type RecurringOccurrenceOutcome,
} from "../../../channels/commerce/occurrence-facts.js";
import type { Occurrence } from "../../domain/entities/occurrence.js";
import { ADVANCE_WEEKS } from "../../domain/services/advance-planning.js";
import { BasketsBehindPlan } from "../../domain/ports/baskets-behind-plan.js";
import {
  type DueOccurrence,
  OccurrenceRepository,
} from "../../domain/ports/occurrence.repository.js";
import { OccurrencePlanner } from "../services/occurrence-planner.js";
import { placementRequestOf } from "../services/placement-request.js";
import {
  SweepDueOccurrencesCommand,
  type RecurringOccurrenceAlert,
  type RecurringOccurrencesSweepReport,
} from "./sweep-due-occurrences.command.js";

/** Au plus autant de paniers et d'échéances par passage : le balayage reste borné, le suivant reprend. */
export const SWEEP_BATCH = 200;
const DAYS_PER_WEEK = 7;

interface Tally {
  planned: number;
  created: number;
  placed: number;
  refused: number;
  missed: number;
  failed: number;
  readonly alerts: RecurringOccurrenceAlert[];
}

/**
 * **Le balayage des paniers récurrents** (cron horaire du Worker), en deux
 * temps (plan `plan-bloc-recurrent.md`, § 5 et § 6.1) :
 *
 * 1. la création à l'avance des paniers en retard sur huit semaines ;
 * 2. les échéances dues — à passer au plus tard aujourd'hui (Paris), prévues
 *    ou refusées, d'un panier actif — lues par l'index `occurrence_due_idx`,
 *    présentées une à une au commerce (`OccurrencePlacement`), puis leur
 *    issue inscrite sous condition d'état, avec son fait durable
 *    (`recurring.occurrence_placed`, `_refused` pour une cause nouvelle,
 *    `_missed`) dans la même transaction.
 *
 * La passation et l'inscription ne partagent pas de transaction : une
 * inscription perdue se répare au passage suivant, la passation rendant la
 * commande déjà passée. Une erreur technique n'arrête pas le balayage : elle
 * est comptée, journalisée, et réessayée au passage suivant.
 *
 * @sans-journal le balayage est la machine, pas une décision : la création à
 * l'avance pose des lignes que le panier décide déjà, chaque commande passée
 * garde sa trace par la passation, et chaque issue s'écrit sur sa ligne
 * d'échéance, avec son heure.
 */
@CommandHandler(SweepDueOccurrencesCommand)
export class SweepDueOccurrencesHandler implements ICommandHandler<
  SweepDueOccurrencesCommand,
  RecurringOccurrencesSweepReport
> {
  private readonly logger = new Logger(SweepDueOccurrencesHandler.name);

  constructor(
    private readonly behind: BasketsBehindPlan,
    private readonly baskets: BasketRepository,
    private readonly occurrences: OccurrenceRepository,
    private readonly planner: OccurrencePlanner,
    private readonly placement: OccurrencePlacement,
    private readonly durable: DurablePublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<RecurringOccurrencesSweepReport> {
    const at = this.clock.now();
    const today = parisDay(at);
    const tally: Tally = {
      planned: 0,
      created: 0,
      placed: 0,
      refused: 0,
      missed: 0,
      failed: 0,
      alerts: [],
    };
    await this.planBehind(today, at, tally);
    const due = await this.occurrences.due(today, SWEEP_BATCH);
    for (const item of due) {
      await this.serve(item, tally);
    }
    return { ...tally, due: due.length };
  }

  private async planBehind(today: IsoDate, at: Date, tally: Tally): Promise<void> {
    const horizon = today.plusDays(ADVANCE_WEEKS * DAYS_PER_WEEK);
    for (const basket of await this.behind.behind(today, horizon, SWEEP_BATCH)) {
      const created = await this.uow.run(async () => {
        const count = await this.planner.planAhead(basket, today, at);
        await this.baskets.save(basket, at);
        return count;
      });
      tally.planned += 1;
      tally.created += created;
    }
  }

  private async serve({ basket, occurrence }: DueOccurrence, tally: Tally): Promise<void> {
    const request = placementRequestOf(basket, occurrence);
    if (request === null) {
      return;
    }
    let outcome: OccurrencePlacementOutcome;
    try {
      outcome = await this.placement.place(request);
    } catch (error) {
      tally.failed += 1;
      this.logger.error(
        `Échéance du ${request.serviceDay} du panier ${basket.id} interrompue, réessayée au prochain passage : ${String(error)}`,
      );
      return;
    }
    const at = this.clock.now();
    if (outcome.kind === "placed") {
      occurrence.place(outcome.orderId, at);
      if (await this.settle(basket, occurrence, { kind: "placed", orderId: outcome.orderId })) {
        tally.placed += 1;
      }
      return;
    }
    const newCause = occurrence.refuse(outcome.cause, outcome.reason, outcome.final, at);
    const kind = outcome.final ? "missed" : "refused";
    // Un refus de même cause ne réalerte pas : il s'inscrit sans fait.
    const told: RecurringOccurrenceOutcome | null =
      outcome.final || newCause ? { kind, cause: outcome.cause, reason: outcome.reason } : null;
    if (!(await this.settle(basket, occurrence, told))) {
      return;
    }
    if (outcome.final) {
      tally.missed += 1;
    } else {
      tally.refused += 1;
    }
    if (newCause) {
      tally.alerts.push({
        subscriptionId: basket.id,
        date: request.serviceDay,
        cause: outcome.cause,
        reason: outcome.reason,
        missed: outcome.final,
      });
    }
  }

  /**
   * Inscrit l'issue sous condition d'état, et son fait dans la même
   * transaction. Faux : un autre écrivain l'a changée entre-temps — ni
   * l'issue ni le fait ne partent.
   */
  private settle(
    basket: Basket,
    occurrence: Occurrence,
    outcome: RecurringOccurrenceOutcome | null,
  ): Promise<boolean> {
    return this.uow.run(async () => {
      if (!(await this.occurrences.save(occurrence))) {
        return false;
      }
      if (outcome !== null && basket.companyId !== null) {
        const fact = new RecurringOccurrenceFact(
          occurrence.id,
          basket.id,
          basket.buyerUserId,
          basket.companyId,
          occurrence.serviceDay.toString(),
          outcome,
        );
        await this.durable.publish(fact.durableFact());
      }
      return true;
    });
  }
}
