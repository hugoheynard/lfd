import type {
  DevScenarioNextReport,
  DevScenarioResetReport,
  DevScenarioStep,
  DevScenarioView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AppConfig } from "../platform/config/app-config.js";
import { PrismaService } from "../platform/database/prisma.service.js";
import { BackgroundWork } from "../platform/events/background-work.js";
import { Clock } from "../platform/time/clock.js";
import { refuseUnlessLocalDevelopment } from "./local-development.lock.js";
import { ScenarioCompleteError, ScenarioNotPlacedError } from "./scenario/scenario-errors.js";
import { readScenarioFacts } from "./scenario/scenario-facts.reader.js";
import { reachedStep, stepViews } from "./scenario/scenario-progress.js";
import { resetScenario, type SeedContext } from "./seeding/orders.seed.js";
import {
  bakeToday,
  closeTodayPlan,
  composeToday,
  loadToday,
  packToday,
  type ScenarioDay,
  scenarioDayOf,
} from "./seeding/today.seed.js";

/** Le geste qui mène d'une étape atteinte à la suivante, et l'étape qu'il joue. */
interface StepGesture {
  readonly played: DevScenarioStep;
  readonly play: (context: SeedContext, day: ScenarioDay) => Promise<unknown>;
}

/**
 * Les gestes, par étape de DÉPART — l'ordre que le code impose (cf. l'en-tête
 * de `today.seed.ts`). La dernière étape n'a pas de suivante.
 */
const NEXT: Readonly<Record<Exclude<DevScenarioStep, 5>, StepGesture>> = {
  0: { played: 1, play: closeTodayPlan },
  1: { played: 2, play: composeToday },
  2: { played: 3, play: bakeToday },
  3: { played: 4, play: packToday },
  4: { played: 5, play: loadToday },
};

/**
 * **Le scénario du jour, étape par étape** (2026-10-05,
 * `documentation/order/plan-jeu-de-donnees-par-etapes.md` §2) : lire où en est
 * la base, jouer l'étape suivante, remettre à l'état de base.
 *
 * Mêmes serrures que `DevSeedService` — base locale, hors production, mur staff
 * au contrôleur, stockage en boucle locale au plus bas — et même instant : un
 * seul `now` par geste, pris au port.
 *
 * Chaque étape est un geste court, joué par les vrais handlers ; « charger
 * jusqu'à » est fait par l'écran, qui enchaîne les `next` et sait ainsi
 * toujours ce qui est en train de se charger.
 */
@Injectable()
export class DevScenarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandBus,
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly work: BackgroundWork,
  ) {}

  /** L'étape atteinte, déduite de la base, et la taille de la base. */
  async state(): Promise<DevScenarioView> {
    refuseUnlessLocalDevelopment(this.config);
    const day = scenarioDayOf(this.clock.now());
    const facts = await readScenarioFacts(this.prisma, day.forDay);
    const [size] = await this.prisma.$queryRaw<{ bytes: bigint }[]>`
      SELECT pg_database_size(current_database()) AS bytes`;
    return {
      day: day.forDay,
      reached: reachedStep(facts),
      steps: stepViews(facts),
      databaseBytes: Number(size?.bytes ?? 0),
    };
  }

  /** Joue UNE étape, depuis l'étape atteinte. */
  async next(requester: string): Promise<DevScenarioNextReport> {
    refuseUnlessLocalDevelopment(this.config);
    const context = this.contextFor(requester);
    const day = scenarioDayOf(context.now);
    // Ce qu'une étape précédente a mis en vol doit être arrivé avant qu'on lise.
    await context.settle();
    const reached = reachedStep(await readScenarioFacts(this.prisma, day.forDay));
    if (reached === null) {
      throw new ScenarioNotPlacedError(day.forDay);
    }
    if (reached === 5) {
      throw new ScenarioCompleteError(day.forDay);
    }
    const gesture = NEXT[reached];
    await gesture.play(context, day);
    return { played: gesture.played };
  }

  /** Retour à l'étape 0 : ce que le scénario avait créé supprimé, ses commandes reposées. */
  async reset(requester: string): Promise<DevScenarioResetReport> {
    refuseUnlessLocalDevelopment(this.config);
    const context = this.contextFor(requester);
    const result = await resetScenario(context, {
      customers: this.config.r2Storage("customers"),
      production: this.config.r2Storage("production"),
    });
    return {
      day: result.today,
      removed: result.purge.removed,
      storage: result.purge.storage,
      placed: result.placed,
    };
  }

  /** UN instant pour tout le geste, pris au port — cf. `DevSeedService.reload`. */
  private contextFor(requester: string): SeedContext {
    return {
      prisma: this.prisma,
      commands: this.commands,
      now: this.clock.now(),
      requester,
      settle: () => this.work.whenIdle(),
    };
  }
}
