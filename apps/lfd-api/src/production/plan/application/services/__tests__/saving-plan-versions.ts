import {
  PlanVersionRecorder,
  type ProductionDay,
  type ProductionDayRepository,
} from "../../../../day/index.js";

type SaveArguments = Parameters<PlanVersionRecorder["save"]>;

/**
 * L'écrivain des versions, doublé : il sauve la journée par le dépôt du test
 * et note chaque version demandée (cause, auteur). La construction de la
 * version est éprouvée au noyau (`plan-version.spec.ts`,
 * `ledger-plan-version-recorder.spec.ts`).
 */
export class SavingPlanVersions extends PlanVersionRecorder {
  readonly requested: { readonly cause: SaveArguments[1]; readonly by: SaveArguments[2] }[] = [];

  constructor(private readonly days: ProductionDayRepository) {
    super();
  }

  async save(day: ProductionDay, cause: SaveArguments[1], by: SaveArguments[2]): Promise<void> {
    this.requested.push({ cause, by });
    await this.days.save(day);
  }
}
