import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  deadlinesOf,
  ProductionDayLock,
  ProductionDayRepository,
  ServiceDay,
} from "../../../day/index.js";
import { ProductionTrackingSettings } from "../../domain/entities/production-tracking-settings.js";
import { ProductionProblemRepository } from "../../domain/ports/production-problem.ports.js";
import { ProductionTrackingSettingsReader } from "../../domain/ports/production-tracking-settings.ports.js";
import { ALWAYS_GREEN_AUTHOR, alwaysGreenStep } from "../../domain/services/always-green.js";
import { BatchRecording } from "../services/batch-recording.service.js";
import { WorksheetDeadlinesReading } from "../services/worksheet-deadlines-reading.service.js";
import {
  type AlwaysGreenLineOutcome,
  RunAlwaysGreenLineCommand,
} from "./run-always-green-line.command.js";

/**
 * **La fournée automatique d'une ligne** (
 * `documentation/fournil/les-niveaux-de-suivi.md`).
 *
 * Dans une unité de travail, le verrou de la journée **d'abord**, puis tout
 * se relit sous lui : les paliers (heure + marge du réglage), le compte, le
 * plafond, le sorti (corrigé déduit) et le nombre de fournées de la ligne,
 * annulées comprises. Une fournée humaine ou un rouge posés avant le verrou
 * sont donc vus, et la cible (`alwaysGreenStep`) ne déclare que ce qui
 * manque. La fournée passe par le même service d'écriture qu'une fournée de
 * l'écran (`BatchRecording`) : remise au colisage comprise.
 *
 * L'`id` `auto-<jour>-<sku>-<n>` fait l'idempotence : deux passages sur le
 * même état rejouent la même charge, que l'agrégat reconnaît sans écrire.
 *
 * Il ne relit pas le niveau de la ligne : le tour l'a lu figé, et un niveau
 * figé ne bouge plus.
 *
 * @sans-journal geste machine, comme une fournée de l'écran (plan de la
 * fiche, D7) ; l'auteur `system:always-green` est rangé sur la fournée.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {ProducedItemNotFoundError} ce SKU n'est pas au compte du jour.
 */
@CommandHandler(RunAlwaysGreenLineCommand)
export class RunAlwaysGreenLineHandler implements ICommandHandler<
  RunAlwaysGreenLineCommand,
  AlwaysGreenLineOutcome
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly lock: ProductionDayLock,
    private readonly deadlines: WorksheetDeadlinesReading,
    private readonly settings: ProductionTrackingSettingsReader,
    private readonly problems: ProductionProblemRepository,
    private readonly recording: BatchRecording,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  execute(command: RunAlwaysGreenLineCommand): Promise<AlwaysGreenLineOutcome> {
    const day = ServiceDay.of(command.serviceDay);
    return this.uow.run(() => this.run(day, command.sku));
  }

  private async run(day: ServiceDay, sku: string): Promise<AlwaysGreenLineOutcome> {
    await this.lock.lock(day);
    const current = await this.days.load(day);
    const item = current.itemToMark(sku);
    const [tranches, settings, problem] = await Promise.all([
      this.deadlines.read(day),
      this.settings.current(),
      this.problems.load(day, sku),
    ]);
    const now = this.clock.now();
    const step = alwaysGreenStep(
      {
        serviceDay: day.value,
        sku,
        counted: item.quantity,
        deadlines: tranches === null ? null : deadlinesOf(item.quantity, tranches.get(sku) ?? []),
        marginMinutes: (settings ?? ProductionTrackingSettings.defaults()).marginMinutes,
        ceiling: problem?.state.produced ?? null,
        output: current.producedOf(sku),
        batchCount: current.batches.filter((batch) => batch.sku === sku).length,
      },
      now,
    );
    if (step.kind !== "record") {
      return step.kind;
    }
    await this.recording.record(
      day,
      current,
      { id: step.batchId, sku, quantity: step.quantity },
      { at: now, by: ALWAYS_GREEN_AUTHOR, initials: "" },
    );
    return "recorded";
  }
}
