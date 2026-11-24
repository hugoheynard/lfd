import { instantToLocal } from "@lfd/contracts";
import { Logger } from "@nestjs/common";
import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  PlaceRecurringOccurrenceCommand,
  type PlaceRecurringOccurrenceResult,
} from "../../../orders/application/commands/place-recurring-occurrence.command.js";
import type { Subscription } from "../../domain/entities/subscription.js";
import { OccurrenceRunLedger } from "../../domain/ports/occurrence-run.ledger.js";
import { PlannerSubscriptions } from "../../domain/ports/planner-subscriptions.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { IsoDate } from "../../domain/value-objects/iso-date.js";
import {
  SweepRecurringOccurrencesCommand,
  type RecurringOccurrenceAlert,
  type RecurringOccurrencesSweepReport,
} from "./sweep-recurring-occurrences.command.js";

/** L'horizon : une échéance se passe une semaine avant son jour (Q1, Hugo, 2026-11-23). */
export const PLANNER_HORIZON_DAYS = 7;
/** Au plus autant de paniers par passage : le balayage reste borné, le suivant reprend. */
export const PLANNER_BATCH = 200;

interface Tally {
  armed: number;
  generated: number;
  refused: number;
  missed: number;
  failed: number;
  readonly alerts: RecurringOccurrenceAlert[];
}

/**
 * **Le balayage du planificateur** (cron horaire du Worker). Pour chaque panier
 * pro actif de l'horizon :
 *
 * 1. le panier jamais armé l'est à aujourd'hui — rien d'avant n'est dû ;
 * 2. ses échéances de `max(armé depuis, aujourd'hui)` à aujourd'hui + 7 jours,
 *    moins celles que le registre dit closes, passent une par une par la
 *    passation d'une échéance (`orders`), qui tranche tout le reste.
 *
 * Aujourd'hui compris : une échéance du jour dont l'heure limite est passée
 * sans commande s'y inscrit « manquée ». Une échéance d'un jour déjà passé
 * n'est plus regardée — après une longue panne du cron, elle reste sans ligne
 * au registre, ce que le planificateur assume (plan, § 4).
 *
 * Une erreur technique sur une échéance n'arrête pas le balayage : elle est
 * comptée, journalisée, et réessayée au passage suivant.
 *
 * @sans-journal la seule écriture propre au balayage est l'armement d'un
 * panier neuf : une borne technique (le premier jour que le planificateur
 * regarde), posée par la machine à son premier passage, que personne ne
 * décide. Chaque commande passée garde sa trace par la passation, et chaque
 * issue sa ligne au registre.
 */
@CommandHandler(SweepRecurringOccurrencesCommand)
export class SweepRecurringOccurrencesHandler implements ICommandHandler<
  SweepRecurringOccurrencesCommand,
  RecurringOccurrencesSweepReport
> {
  private readonly logger = new Logger(SweepRecurringOccurrencesHandler.name);

  constructor(
    private readonly planner: PlannerSubscriptions,
    private readonly subscriptions: SubscriptionRepository,
    private readonly ledger: OccurrenceRunLedger,
    private readonly commands: CommandBus,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<RecurringOccurrencesSweepReport> {
    const today = IsoDate.fromString(instantToLocal(this.clock.now()).day);
    const horizonEnd = today.plusDays(PLANNER_HORIZON_DAYS);
    const baskets = await this.planner.inHorizon(today, horizonEnd, PLANNER_BATCH);
    const tally: Tally = { armed: 0, generated: 0, refused: 0, missed: 0, failed: 0, alerts: [] };
    for (const basket of baskets) {
      await this.serve(basket, today, horizonEnd, tally);
    }
    return { subscriptions: baskets.length, ...tally };
  }

  private async serve(
    basket: Subscription,
    today: IsoDate,
    horizonEnd: IsoDate,
    tally: Tally,
  ): Promise<void> {
    if (basket.armedSince === null) {
      basket.arm(today);
      await this.subscriptions.save(basket);
      tally.armed += 1;
    }
    const armedFrom = basket.armedSince ?? today;
    const from = IsoDate.latest(armedFrom, today);
    const id = basket.persistedId;
    const closed = new Set(
      (await this.ledger.runsBetween(id, from, horizonEnd))
        .filter((run) => run.outcome !== "refused")
        .map((run) => run.date.toString()),
    );
    for (const occurrence of basket.occurrencesBetween(from, horizonEnd)) {
      const date = occurrence.date.toString();
      if (!closed.has(date)) {
        await this.place(id, date, tally);
      }
    }
  }

  private async place(subscriptionId: string, date: string, tally: Tally): Promise<void> {
    try {
      const result = await this.commands.execute<
        PlaceRecurringOccurrenceCommand,
        PlaceRecurringOccurrenceResult
      >(new PlaceRecurringOccurrenceCommand(subscriptionId, date));
      count(result, subscriptionId, date, tally);
    } catch (error) {
      tally.failed += 1;
      this.logger.error(
        `Échéance du ${date} du panier ${subscriptionId} interrompue, réessayée au prochain passage : ${String(error)}`,
      );
    }
  }
}

function count(
  result: PlaceRecurringOccurrenceResult,
  subscriptionId: string,
  date: string,
  tally: Tally,
): void {
  if (result.kind === "generated") {
    tally.generated += 1;
    return;
  }
  if (result.kind !== "refused" && result.kind !== "missed_deadline") {
    return;
  }
  const missed = result.kind === "missed_deadline";
  if (missed) {
    tally.missed += 1;
  } else {
    tally.refused += 1;
  }
  if (result.newCause) {
    tally.alerts.push({ subscriptionId, date, cause: result.cause, reason: result.reason, missed });
  }
}
