import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { recordOf, textOf } from "../payload-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_OUTPUT_CORRECTED = "production.output_corrected";

/** Une fournée corrigée : sa remise, la part retirée par ce rouge, et sa part corrigée en tout. */
export interface CorrectedHandoff {
  /** L'`id` de la remise au colisage — celui de la fournée (`handed_to_packing`). */
  readonly handoffId: string;
  readonly corrected: number;
  readonly totalCorrected: number;
}

/**
 * **Une correction de déclaration** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) : des pièces que
 * le fournil a remises au colisage n'ont jamais existé. Ce n'est pas un
 * retour — rien ne bouge physiquement.
 *
 * ## Le contrat
 *
 * `{ problemId, version, serviceDay, sku, batches: [{ handoffId, corrected,
 * totalCorrected }] }`. Publié par le rouge **seulement s'il a corrigé** ; le
 * même à tous les niveaux de suivi du fournil.
 *
 * ## La clé
 *
 * `production.output_corrected:<problemId>:<version>` — un rouge, une
 * correction.
 *
 * Le colisage l'écoute (`packing.apply-output-correction`) : la réserve
 * `(jour, SKU)` perd les pièces qui n'ont jamais existé. Les faits publiés
 * avant cet abonné ne lui sont pas livrés (la boîte d'envoi ne livre qu'aux
 * abonnés connus à l'écriture) : il les rattrape par `OutputCorrectionsReader`.
 *
 * 🔴 Il vit dans le CANAL : le colisage le lira, et `lint:context-boundaries`
 * n'autorise `packing → production` que par ce dossier.
 */
export class OutputCorrectedEvent implements DurableEvent {
  constructor(
    readonly problemId: string,
    readonly version: number,
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly sku: string,
    readonly batches: readonly CorrectedHandoff[],
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_OUTPUT_CORRECTED,
      key: `${PRODUCTION_OUTPUT_CORRECTED}:${this.problemId}:${String(this.version)}`,
      payload: {
        problemId: this.problemId,
        version: this.version,
        serviceDay: this.serviceDay,
        sku: this.sku,
        batches: this.batches.map((batch) => ({
          handoffId: batch.handoffId,
          corrected: batch.corrected,
          totalCorrected: batch.totalCorrected,
        })),
      },
    };
  }

  /** @throws {OutputCorrectedPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OutputCorrectedEvent {
    const problemId = textOf(payload["problemId"]);
    const version = countOf(payload["version"]);
    const serviceDay = textOf(payload["serviceDay"]);
    const sku = textOf(payload["sku"]);
    const batches = batchesOf(payload["batches"]);
    if (
      problemId === null ||
      version === null ||
      serviceDay === null ||
      sku === null ||
      batches === null
    ) {
      throw new OutputCorrectedPayloadError();
    }
    return new OutputCorrectedEvent(problemId, version, serviceDay, sku, batches);
  }
}

/** Un entier positif ou nul, ou `null`. */
function countOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function batchesOf(value: unknown): readonly CorrectedHandoff[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const batches: CorrectedHandoff[] = [];
  for (const item of value) {
    const record = recordOf(item);
    const handoffId = textOf(record?.["handoffId"]);
    const corrected = countOf(record?.["corrected"]);
    const totalCorrected = countOf(record?.["totalCorrected"]);
    if (handoffId === null || corrected === null || totalCorrected === null) {
      return null;
    }
    batches.push({ handoffId, corrected, totalCorrected });
  }
  return batches;
}

export class OutputCorrectedPayloadError extends TechnicalError {
  constructor() {
    super(
      "output_corrected.payload_invalid",
      "Le fait « correction du fournil » reçu est illisible (rouge, version, journée, article ou " +
        "fournées manquants) : la réserve du colisage n'a pas été corrigée. Le message reste dans la " +
        "boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
