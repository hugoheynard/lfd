import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  ProductionDayRepository,
  ProductionDayStatusReader,
  ServiceDay,
  todayOf,
  tomorrowOf,
} from "../../../day/index.js";
import { AlwaysGreenLines } from "../services/always-green-lines.service.js";
import { DayTrackingLevelsFreezing } from "../services/day-tracking-levels-freezing.service.js";
import { AlwaysGreenLineRunner } from "../../domain/ports/always-green-line-runner.js";
import type { AlwaysGreenLineOutcome } from "../../domain/services/always-green.js";
import {
  type AlwaysGreenDayReport,
  type AlwaysGreenRoundReport,
  RunAlwaysGreenRoundCommand,
} from "./run-always-green-round.command.js";

import { TrackingLevelsCommissioning } from "../../domain/ports/tracking-levels-commissioning.js";
import { mayRunAlwaysGreen } from "../../domain/services/tracking-levels.js";
/**
 * **Le tour de la fournée automatique** (
 * `documentation/fournil/les-niveaux-de-suivi.md`).
 *
 * Pour aujourd'hui et demain à l'heure de Paris — la fiche en cours est
 * demain dès que son plan est arrêté —, chaque journée **arrêtée** : son
 * niveau est figé s'il ne l'est pas (`DayTrackingLevelsFreezing`, sous le
 * verrou), puis chaque SKU au compte dont la ligne est en toujours vert
 * d'après ce niveau reçoit sa commande, `RunAlwaysGreenLineCommand`. Une
 * journée arrêtée avant la mise en service est en détaillé : aucune ligne ;
 * avant la mise en service, le tour ne lit rien. Une journée dont aucune
 * ligne ne peut être en toujours vert n'est pas chargée.
 *
 * **Chaque ligne est isolée**, comme chaque journée : une erreur se
 * journalise et les autres continuent. Le passage suivant, cinq minutes plus
 * tard, retente — une ligne n'écrit qu'une fournée par état, sous son `id`.
 *
 * @sans-journal geste machine ; les fournées qu'il déclare portent leur auteur
 * (`system:always-green`).
 */
@CommandHandler(RunAlwaysGreenRoundCommand)
export class RunAlwaysGreenRoundHandler implements ICommandHandler<
  RunAlwaysGreenRoundCommand,
  AlwaysGreenRoundReport
> {
  private readonly logger = new Logger(RunAlwaysGreenRoundHandler.name);

  constructor(
    private readonly clock: Clock,
    private readonly status: ProductionDayStatusReader,
    private readonly freezing: DayTrackingLevelsFreezing,
    private readonly days: ProductionDayRepository,
    private readonly lines: AlwaysGreenLines,
    private readonly runner: AlwaysGreenLineRunner,
    private readonly commissioning: TrackingLevelsCommissioning,
  ) {}

  async execute(): Promise<AlwaysGreenRoundReport> {
    const now = this.clock.now();
    // Avant la mise en service, toute journée arrêtée l'a été avant : en
    // détaillé. Le tour ne lit rien — il passe toutes les cinq minutes.
    if (now.getTime() < this.commissioning.since().getTime()) {
      return { days: [] };
    }
    const days: AlwaysGreenDayReport[] = [];
    for (const day of [todayOf(now), tomorrowOf(now)]) {
      days.push(await this.forDay(ServiceDay.of(day)));
    }
    return { days };
  }

  private async forDay(day: ServiceDay): Promise<AlwaysGreenDayReport> {
    const untouched = { serviceDay: day.value, recorded: [], toConfirm: [], failed: [] };
    let arrested = false;
    try {
      arrested = await this.status.isClosed(day);
      if (!arrested) {
        return { ...untouched, arrested, error: null };
      }
      const levels = await this.freezing.freezeIfDue(day);
      if (!mayRunAlwaysGreen(levels)) {
        return { ...untouched, arrested, error: null };
      }
      const skus = await this.lines.skusOf(day, await this.days.load(day), levels);
      return { serviceDay: day.value, arrested, error: null, ...(await this.runLines(day, skus)) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({
        message: "always_green_day_failed",
        serviceDay: day.value,
        error: message,
      });
      return { ...untouched, arrested, error: message };
    }
  }

  private async runLines(
    day: ServiceDay,
    skus: readonly string[],
  ): Promise<Pick<AlwaysGreenDayReport, "recorded" | "toConfirm" | "failed">> {
    const recorded: string[] = [];
    const toConfirm: string[] = [];
    const failed: string[] = [];
    for (const sku of skus) {
      const outcome = await this.runLine(day, sku);
      if (outcome === "recorded") recorded.push(sku);
      if (outcome === "no_deadline") toConfirm.push(sku);
      if (outcome === "failed") failed.push(sku);
    }
    return { recorded, toConfirm, failed };
  }

  private async runLine(day: ServiceDay, sku: string): Promise<AlwaysGreenLineOutcome | "failed"> {
    try {
      return await this.runner.run(day, sku);
    } catch (error) {
      this.logger.error({
        message: "always_green_line_failed",
        serviceDay: day.value,
        sku,
        error: error instanceof Error ? error.message : String(error),
      });
      return "failed";
    }
  }
}
