import type { ProductionBatchSnapshot } from "../../../day/index.js";
import { stillAtPackingOf } from "./on-site-share.js";

/**
 * **Où se prend une correction de déclaration** (
 * `documentation/fournil/les-niveaux-de-suivi.md`).
 *
 * Le rouge dit qu'il est sorti moins que les fournées ne le disent : l'écart
 * est un nombre de pièces déclarées qui n'ont jamais existé. Il se prend sur
 * la part **remise** au colisage des fournées vivantes de la ligne, les plus
 * récentes d'abord — automatiques, « Fait » et humaines confondues —, jamais
 * sur une part gardée sur place par un réassort, que le colisage n'a pas.
 *
 * La borne, par fournée : `corrigé ≤ remis − rendu − retour en attente`. Une
 * fournée qui a un retour en attente est **sautée** : sa réponse n'est pas
 * encore connue, et corriger dessus ferait rendre au colisage des pièces qu'on
 * vient de dire inexistantes. Faute d'assez de part corrigeable, on corrige ce
 * qu'on peut et `uncorrected` dit le reste — au manager de le régler.
 */

/** Une fournée corrigée : sa part retirée par ce rouge, et sa part corrigée en tout. */
export interface BatchCorrection {
  /** L'`id` de la fournée — aussi celui de sa remise au colisage (`handoffOf`). */
  readonly batchId: string;
  readonly corrected: number;
  readonly totalCorrected: number;
}

/** La correction d'une ligne : ce qui a été pris, et ce qui reste à corriger. */
export interface OutputCorrection {
  readonly corrections: readonly BatchCorrection[];
  readonly uncorrected: number;
}

/** Ce qu'une fournée remise peut encore perdre par correction. */
export function correctableOf(batch: ProductionBatchSnapshot, handed: number): number {
  if (batch.cancelled !== null || batch.pendingReturn > 0) {
    return 0;
  }
  return stillAtPackingOf(batch, handed);
}

/**
 * Répartit `gap` pièces à corriger sur `batches` — les fournées de la ligne
 * dans l'ordre de sortie (`activeBatchesOf`), telles que la base les porte
 * (rendu et corrigé non déduits) — d'après ce que le registre dit remis de
 * chacune. Une fournée absente du registre n'a rien de remis.
 */
export function outputCorrectionOf(
  batches: readonly ProductionBatchSnapshot[],
  handedByBatch: ReadonlyMap<string, number>,
  gap: number,
): OutputCorrection {
  let remaining = Math.max(0, gap);
  const corrections: BatchCorrection[] = [];
  for (const batch of [...batches].reverse()) {
    if (remaining === 0) {
      break;
    }
    const taken = Math.min(remaining, correctableOf(batch, handedByBatch.get(batch.id) ?? 0));
    if (taken > 0) {
      corrections.push({
        batchId: batch.id,
        corrected: taken,
        totalCorrected: batch.corrected + taken,
      });
      remaining -= taken;
    }
  }
  return { corrections, uncorrected: remaining };
}
