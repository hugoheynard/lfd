import { HandoverProofRetentionInvalidError } from "../errors/handover-proof-errors.js";

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * **Combien de jours on garde les pièces d'une remise à la porte** —
 * `documentation/livraisons/livreur/a-la-porte.md` (Hugo, 2026-10-01 : « pour
 * l'instant infini, mais câbler la possibilité d'une purge »).
 *
 * Une DURÉE, pas un instant de coupure, et c'est délibéré : la politique se dit
 * en jours (« 90 jours proposés »), et l'instant se calcule contre l'horloge du
 * backend au moment de la purge. Un appelant qui fournirait l'instant pourrait
 * en donner un dans le futur et tout effacer d'un coup ; une durée d'au moins
 * un jour ne le peut pas.
 *
 * ⚠️ Rien ne fixe la durée aujourd'hui : la conservation reste INFINIE tant
 * qu'aucun appel planifié ne l'exerce.
 */
export class HandoverProofRetention {
  private constructor(readonly days: number) {}

  /** @throws {HandoverProofRetentionInvalidError} moins d'un jour, ou pas un nombre entier. */
  static ofDays(days: number): HandoverProofRetention {
    if (!Number.isInteger(days) || days < 1) {
      throw new HandoverProofRetentionInvalidError(days);
    }
    return new HandoverProofRetention(days);
  }

  /** L'instant avant lequel une pièce a dépassé la conservation. */
  cutoffFrom(now: Date): Date {
    return new Date(now.getTime() - this.days * MILLISECONDS_PER_DAY);
  }
}
