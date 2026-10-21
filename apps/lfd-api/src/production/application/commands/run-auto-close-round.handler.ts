import { addDays, instantToLocal } from "@lfd/contracts";
import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { DayOrdersReader } from "../../channels/commerce/day-orders.reader.js";
import { ProductionDayEmptyError } from "../../domain/errors/production-errors.js";
import { AutoCloseAttempts } from "../../domain/ports/auto-close-attempts.js";
import { AutoCloseRoundReader } from "../../domain/ports/auto-close-round.reader.js";
import { AutomaticDayCloser } from "../../domain/ports/automatic-day-closer.js";
import { ProductionSettingsReader } from "../../domain/ports/production-settings.reader.js";
import {
  closeStep,
  closesOnItsOwnDay,
  todayNeedsCatchUp,
} from "../../domain/services/auto-close-round.js";
import { planStopsAt } from "../../domain/services/latest-order-cutoff.js";
import { PlanStopRules } from "../services/plan-stop-rules.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PlanArrestBell } from "../services/plan-arrest-bell.js";
import {
  RunAutoCloseRoundCommand,
  type AutoCloseRoundOutcome,
  type AutoCloseRoundReport,
} from "./run-auto-close-round.command.js";

/**
 * **Le tour de l'arrêt du plan** (plan `arret-du-plan.md`, §3, §4, B2,
 * S4, S7, S8, lot A2), à l'heure de la maison.
 *
 * Depuis le 2026-10-21, l'heure limite générale déclenche tout
 * (`limites-de-commande/plan-une-seule-heure.md` §5) : pour le LENDEMAIN,
 * passé la fin du rattrapage de la règle générale pour lui, UNE tentative par
 * journée — la vraie clôture, balayage compris — dont la trace est prise en
 * base avant d'agir ; rien un jour fermé, rien sans heure limite posée. Plus
 * de mode manuel, plus d'alerte du soir.
 *
 * Pour AUJOURD'HUI : la même tentative quand son arrêt tombe aujourd'hui même
 * (une limite « le jour même », un rattrapage qui passe minuit) ; sinon jamais
 * d'arrêt, une alerte de rattrapage s'il porte des commandes sans plan arrêté.
 *
 * Une tentative restée `pending` plus de quinze minutes (processus mort entre
 * la prise et l'issue) n'est pas retentée non plus : une alerte dédiée part,
 * une fois par journée (Q8).
 *
 * ## Une tentative, pas une boucle
 *
 * Une clôture qui casse (autre chose que « vide ») n'est PAS retentée au tour
 * suivant : la trace dit `failed` et son message, et l'alerte « pas arrêté »
 * part aux personnes qui peuvent l'arrêter. Retenter toutes les cinq minutes
 * rebalaierait les règlements chez Stripe sur une panne qui ne guérit pas
 * seule ; le geste manuel reste ouvert (l'heure est passée) et la journée
 * reste dans la bande.
 *
 * @sans-journal geste machine ; l'arrêt qu'il déclenche se journalise lui-même
 * (`production_day.closed`, `automatic: true`), et la trace des tentatives est la sienne.
 */
@CommandHandler(RunAutoCloseRoundCommand)
export class RunAutoCloseRoundHandler implements ICommandHandler<
  RunAutoCloseRoundCommand,
  AutoCloseRoundReport
> {
  private readonly logger = new Logger(RunAutoCloseRoundHandler.name);

  constructor(
    private readonly clock: Clock,
    private readonly settings: ProductionSettingsReader,
    private readonly days: AutoCloseRoundReader,
    private readonly attempts: AutoCloseAttempts,
    private readonly orders: DayOrdersReader,
    private readonly closer: AutomaticDayCloser,
    private readonly bell: PlanArrestBell,
    private readonly stopRules: PlanStopRules,
  ) {}

  async execute(): Promise<AutoCloseRoundReport> {
    const now = this.clock.now();
    const local = instantToLocal(now);
    const today = ServiceDay.of(local.day);
    const tomorrow = ServiceDay.of(addDays(local.day, 1));
    // La plus tardive de l'heure limite générale (rattrapage compris) et de
    // l'heure du réassort (lot R3a, 2026-10-21).
    const rules = await this.stopRules.rules();
    const outcome = await this.forDay(tomorrow, planStopsAt(rules, tomorrow.value), now);
    const todayClosesAt = planStopsAt(rules, today.value);
    if (closesOnItsOwnDay(todayClosesAt, today.value)) {
      const todayOutcome = await this.forDay(today, todayClosesAt, now);
      return { tomorrow: tomorrow.value, outcome, todayOutcome, todayOverdue: false };
    }
    const todayOverdue = await this.catchUp(today, now);
    return { tomorrow: tomorrow.value, outcome, todayOutcome: "nothing", todayOverdue };
  }

  private async forDay(
    day: ServiceDay,
    closesAt: Date | null,
    now: Date,
  ): Promise<AutoCloseRoundOutcome> {
    const step = closeStep(closesAt, now, {
      isClosedDay: (await this.settings.closedDaysFrom(day.value)).includes(day.value),
      isPlanClosed: await this.days.isPlanClosed(day),
      attempt: await this.days.attemptOf(day),
    });
    if (step === "attempt_close") {
      return this.attempt(day, now);
    }
    if (step === "alert_stalled") {
      await this.bell.autoCloseStalled(day, now);
      return "stalled";
    }
    return "nothing";
  }

  /** La trace d'abord : c'est l'insertion qui décide qui tente (B2). */
  private async attempt(day: ServiceDay, now: Date): Promise<AutoCloseRoundOutcome> {
    if (!(await this.attempts.claim(day, now))) {
      return "nothing";
    }
    try {
      await this.closer.close(day);
    } catch (error) {
      return this.afterRefusal(day, now, error);
    }
    await this.attempts.settle(day, "closed", null, now);
    return "closed";
  }

  private async afterRefusal(
    day: ServiceDay,
    now: Date,
    error: unknown,
  ): Promise<AutoCloseRoundOutcome> {
    if (error instanceof ProductionDayEmptyError) {
      await this.attempts.settle(day, "empty", null, now);
      await this.bell.nothingToArrest(day, now);
      return "empty";
    }
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error({ message: "auto_close_failed", serviceDay: day.value, error: message });
    await this.attempts.settle(day, "failed", message, now);
    await this.bell.notArrested(day, now, message);
    return "failed";
  }

  /** S4 : un plan d'aujourd'hui dont l'arrêt était hier n'est pas arrêté d'office — on prévient. */
  private async catchUp(today: ServiceDay, now: Date): Promise<boolean> {
    if (await this.days.isPlanClosed(today)) {
      return false;
    }
    const overdue = todayNeedsCatchUp(false, (await this.orders.producibleFor(today)).length);
    if (overdue) {
      await this.bell.todayNotArrested(today, now);
    }
    return overdue;
  }
}
