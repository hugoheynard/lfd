import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  type ProductionDay,
  ProductionDayRepository,
  ProductionDayStatusReader,
  ServiceDay,
  todayOf,
  tomorrowOf,
} from "../../../day/index.js";
import { ProductionTrackingSettings } from "../../domain/entities/production-tracking-settings.js";
import { DayProblemsReader } from "../../domain/ports/production-problem.ports.js";
import { ProductionTrackingSettingsReader } from "../../domain/ports/production-tracking-settings.ports.js";
import { alwaysGreenStep } from "../../domain/services/always-green.js";
import { alwaysGreenLineOf, type AlwaysGreenDayReads } from "../services/always-green-line-of.js";
import { AlwaysGreenLines } from "../services/always-green-lines.service.js";
import { WorksheetDeadlinesReading } from "../services/worksheet-deadlines-reading.service.js";
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

/** Le code rendu au Worker quand une journée échoue ; le détail est au journal. */
const DAY_FAILED = "always_green_day_failed";

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
    private readonly deadlines: WorksheetDeadlinesReading,
    private readonly settings: ProductionTrackingSettingsReader,
    private readonly problems: DayProblemsReader,
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
      const current = await this.days.load(day);
      const skus = await this.lines.skusOf(day, current, levels);
      const reads = await this.readsOf(day, skus);
      return {
        serviceDay: day.value,
        arrested,
        error: null,
        ...(await this.runLines(day, current, skus, reads)),
      };
    } catch (error) {
      this.logger.error({
        message: "always_green_day_failed",
        serviceDay: day.value,
        error: error instanceof Error ? error.message : String(error),
      });
      // Le message technique reste au journal ; la réponse au Worker ne porte qu'un code.
      return { ...untouched, arrested, error: DAY_FAILED };
    }
  }

  /** Les lectures de la journée, une fois pour toutes ses lignes ; aucune sans ligne. */
  private async readsOf(day: ServiceDay, skus: readonly string[]): Promise<AlwaysGreenDayReads> {
    if (skus.length === 0) {
      return { tranches: null, marginMinutes: 0, ceilings: new Map() };
    }
    const [tranches, settings, problems] = await Promise.all([
      this.deadlines.read(day),
      this.settings.current(),
      this.problems.allOf(day),
    ]);
    return {
      tranches,
      marginMinutes: (settings ?? ProductionTrackingSettings.defaults()).marginMinutes,
      ceilings: new Map(problems.map((problem) => [problem.sku, problem.produced])),
    };
  }

  /**
   * Trie les lignes hors verrou, puis ne fait passer sous le verrou que celles
   * qui ont une fournée à déclarer : le passage d'une ligne relit tout et
   * décide seul. Une ligne que le tri dit sans rien à faire coûte zéro lecture.
   */
  private async runLines(
    day: ServiceDay,
    current: ProductionDay,
    skus: readonly string[],
    reads: AlwaysGreenDayReads,
  ): Promise<Pick<AlwaysGreenDayReport, "recorded" | "toConfirm" | "failed">> {
    const recorded: string[] = [];
    const toConfirm: string[] = [];
    const failed: string[] = [];
    const now = this.clock.now();
    for (const sku of skus) {
      const quantity = current.counts.find((item) => item.sku === sku)?.quantity ?? 0;
      const step = alwaysGreenStep(alwaysGreenLineOf(day, current, sku, quantity, reads), now);
      if (step.kind === "no_deadline") toConfirm.push(sku);
      if (step.kind !== "record") continue;
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
