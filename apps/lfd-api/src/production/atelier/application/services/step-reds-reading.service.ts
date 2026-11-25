import type { ProductionStepRedView } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import type { ProductionDay, ServiceDay } from "../../../day/index.js";
import { WorkstationOfProducts } from "../../../workstations/index.js";
import { DayLineStepsReader } from "../../domain/ports/line-step.ports.js";

/**
 * **Les étapes en rouge d'une journée**, pour la Supervision (
 * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.3,
 * point 6) : elles vont dans la même liste que les problèmes, marquées
 * « étape ». Les plus anciennes d'abord.
 *
 * Le nom du poste se lit sur les postes en service ; s'ils ne répondent pas,
 * la panne est journalisée et les rouges sont servis sans nom : la
 * Supervision ne tombe pas pour un libellé.
 */
@Injectable()
export class StepRedsReading {
  private readonly logger = new Logger(StepRedsReading.name);

  constructor(
    private readonly steps: DayLineStepsReader,
    private readonly workstations: WorkstationOfProducts,
  ) {}

  async of(day: ServiceDay, current: ProductionDay): Promise<readonly ProductionStepRedView[]> {
    const reds = (await this.steps.allOf(day))
      .filter((step) => step.status === "red")
      .sort((left, right) => left.checked.at.getTime() - right.checked.at.getTime());
    if (reds.length === 0) {
      return [];
    }
    const names = await this.namesOrEmpty(day);
    return reds.map((step) => ({
      sku: step.sku,
      productName: current.counts.find((item) => item.sku === step.sku)?.productName ?? step.sku,
      workstationId: step.workstationId,
      workstationName: names.get(step.workstationId) ?? null,
      reason: step.reason,
      reportedAt: step.checked.at.toISOString(),
      reportedByName: step.checked.name,
      version: step.version,
    }));
  }

  private async namesOrEmpty(day: ServiceDay): Promise<ReadonlyMap<string, string>> {
    try {
      const { workstations } = await this.workstations.workstationsOf([]);
      return new Map(workstations.map((station) => [station.id, station.name]));
    } catch (error) {
      this.logger.error(
        `Supervision du ${day.value} : postes illisibles, rouges d'étape servis sans nom.`,
        error instanceof Error ? error.stack : String(error),
      );
      return new Map();
    }
  }
}
