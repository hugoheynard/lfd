import { Injectable } from "@nestjs/common";

import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { OutputCorrectedEvent } from "../../../channels/packing/output-corrected.event.js";
import {
  activeBatchesOf,
  ProductionBatchRepository,
  ProductionHandoffReader,
} from "../../../day/index.js";
import type { ProductionDay, ServiceDay } from "../../../day/index.js";
import type { ProductionProblemState } from "../../domain/entities/production-problem.js";
import {
  type OutputCorrection,
  outputCorrectionOf,
} from "../../domain/services/output-correction.js";

/**
 * **Corriger ce qui a été déclaré** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.4, § 3.5) : la part
 * corrigée des fournées remises de la ligne monte, et
 * `production.output_corrected` part — **seulement si quelque chose a été
 * corrigé**.
 *
 * La répartition et sa borne sont au domaine (`outputCorrectionOf`) ; ce
 * service lit ce que le registre dit remis, écrit ce qu'elle a laissé passer
 * et publie. 🔴 Il tourne dans l'unité de travail du rouge, sous le verrou
 * de la journée, sur la journée rechargée sous lui : il n'en ouvre pas.
 */
@Injectable()
export class OutputCorrecting {
  constructor(
    private readonly handed: ProductionHandoffReader,
    private readonly batches: ProductionBatchRepository,
    private readonly durable: DurablePublisher,
  ) {}

  async correct(
    day: ServiceDay,
    current: ProductionDay,
    problem: ProductionProblemState,
    gap: number,
  ): Promise<OutputCorrection> {
    const line = activeBatchesOf(current.batches, problem.sku);
    const handed = await this.handed.handedAmong(
      day,
      line.map((batch) => batch.id),
    );
    const correction = outputCorrectionOf(line, handed, gap);
    if (correction.corrections.length === 0) {
      return correction;
    }
    await this.batches.correct(
      day,
      correction.corrections.map((batch) => ({
        id: batch.batchId,
        totalCorrected: batch.totalCorrected,
      })),
    );
    await this.durable.publish(
      new OutputCorrectedEvent(
        problem.id,
        problem.version,
        day.value,
        problem.sku,
        correction.corrections.map((batch) => ({
          handoffId: batch.batchId,
          corrected: batch.corrected,
          totalCorrected: batch.totalCorrected,
        })),
      ).durableFact(),
    );
    return correction;
  }
}
