import { Injectable } from "@nestjs/common";

import { deadlinesOf, type ProductionDay, type ServiceDay } from "../../../day/index.js";
import type { LineStepKey } from "../../domain/entities/line-step.js";
import { AutomaticStepChecks, DayLineStepsReader } from "../../domain/ports/line-step.ports.js";
import { ALWAYS_GREEN_AUTHOR } from "../../domain/services/always-green.js";
import { alwaysGreenStepCheck } from "../../domain/services/always-green-steps.js";
import type { AlwaysGreenDayReads } from "./always-green-line-of.js";

/** Ce que le passage a fait des étapes d'une journée. */
export interface AlwaysGreenStepsReport {
  /** Le nombre d'étapes cochées d'office à ce passage. */
  readonly checked: number;
  /** Les étapes sans palier à heure, pas encore touchées : à confirmer. */
  readonly toConfirm: readonly LineStepKey[];
}

/**
 * **Les étapes cochées d'office** (
 * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.4) : le
 * même tour que la fournée automatique, pour les postes d'étape en toujours
 * vert. Une étape échue (`alwaysGreenStepCheck`) et jamais touchée est
 * écrite `done`, auteur `system:always-green`, par une insertion qui ignore
 * le conflit : une étape déjà faite, en rouge ou décochée par quelqu'un
 * n'est pas réécrite. Une étape cochée ne compte aucune pièce.
 *
 * La fournée n'attend pas les étapes, ni l'inverse : les deux passages sont
 * indépendants. Les étapes déjà en base sont écartées avant l'écriture — une
 * journée dont tout est coché ne coûte qu'une lecture.
 *
 * @sans-journal geste machine, comme la fournée automatique ; l'auteur est
 * rangé sur l'étape.
 */
@Injectable()
export class AlwaysGreenStepsRound {
  constructor(
    private readonly steps: DayLineStepsReader,
    private readonly checks: AutomaticStepChecks,
  ) {}

  /** @param candidates les étapes en toujours vert de la journée (`AlwaysGreenLines.stepsOf`). */
  async run(
    current: ProductionDay,
    day: ServiceDay,
    candidates: readonly LineStepKey[],
    reads: Pick<AlwaysGreenDayReads, "tranches" | "marginMinutes">,
    now: Date,
  ): Promise<AlwaysGreenStepsReport> {
    if (candidates.length === 0) {
      return { checked: 0, toConfirm: [] };
    }
    const touched = new Set(
      (await this.steps.allOf(day)).map((step) => keyOf(step.sku, step.workstationId)),
    );
    const due: LineStepKey[] = [];
    const toConfirm: LineStepKey[] = [];
    for (const step of candidates.filter(
      (key) => !touched.has(keyOf(key.sku, key.workstationId)),
    )) {
      const quantity = current.counts.find((item) => item.sku === step.sku)?.quantity ?? 0;
      const check = alwaysGreenStepCheck(
        {
          serviceDay: day.value,
          deadlines:
            reads.tranches === null
              ? null
              : deadlinesOf(quantity, reads.tranches.get(step.sku) ?? []),
          marginMinutes: reads.marginMinutes,
        },
        now,
      );
      if (check === "check") due.push(step);
      if (check === "no_deadline") toConfirm.push(step);
    }
    const checked = await this.checks.checkIfAbsent(due, now, ALWAYS_GREEN_AUTHOR);
    return { checked, toConfirm };
  }
}

function keyOf(sku: string, workstationId: string): string {
  return JSON.stringify([sku, workstationId]);
}
