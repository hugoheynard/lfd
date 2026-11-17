import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";

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
 * **Une correction de déclaration** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.5) : des pièces que
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
 * Aucun abonné aujourd'hui : un futur abonné du colisage ne recevra pas les
 * faits publiés avant lui (la boîte d'envoi ne livre qu'aux abonnés connus à
 * l'écriture), et relira donc les corrections par `OutputCorrectionsReader`.
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
}
