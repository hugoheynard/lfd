import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../staff/notifications/domain/ports/staff-notifier.js";

/**
 * Ceux qui décident d'un manque : une pièce corrigée que la réserve ne couvre
 * pas est dans le sac d'une commande — c'est à eux de trancher, comme pour
 * le manque que le colisage signale.
 */
const AUDIENCE: StaffPermission = "b2b_orders_shortfall:write";

/** Le genre de la cloche. */
export const OUTPUT_CORRECTION_BELL = "packing.output_correction_uncovered";

const RUNG = "packing-output-correction-bell";

/** Le reste d'une correction que la réserve n'a pas pu absorber. */
export interface UncoveredCorrection {
  readonly serviceDay: string;
  readonly handoffId: string;
  readonly sku: string;
  /** Le cumul corrigé publié par le fournil pour cette remise. */
  readonly totalCorrected: number;
  readonly uncovered: number;
  readonly at: Date;
}

/**
 * **La cloche d'une correction non couverte** (D9 de
 * `colisage/plan-niveaux-de-suivi-colisage.md`) : le fournil dit que des
 * pièces n'ont jamais existé, et la réserve ne les a plus — elles sont au
 * sac d'une commande, réservées ou parties. Aucune commande n'est touchée ;
 * quelqu'un va voir.
 *
 * Après validation (`AfterCommit`). Une fois par cumul : la clé porte le
 * total corrigé, donc un reste retenté au fait suivant ne sonne pas deux
 * fois, et une nouvelle correction de la même remise sonne de nouveau.
 */
@Injectable()
export class CorrectionBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  ringAfterCommit(correction: UncoveredCorrection): void {
    const notice = noticeOf(correction);
    this.afterCommit.defer(() => this.work.track(this.notifier.notify([notice]), RUNG), RUNG);
  }
}

function noticeOf(correction: UncoveredCorrection): StaffNotice {
  const pieces = String(correction.uncovered);
  return {
    kind: OUTPUT_CORRECTION_BELL,
    subject: `Correction du fournil non couverte — ${correction.sku}, ${correction.serviceDay}`,
    body:
      `Le fournil déclare que ${pieces} pièce(s) de ${correction.sku} remises au colisage n'ont jamais existé, ` +
      "mais la réserve ne les a plus : elles sont au sac d'une commande, réservées ou parties. " +
      "Aucune commande n'a été modifiée : vérifiez les sacs au colisage, et signalez un manque par « Problème » s'il le faut.",
    link: "/colisage",
    idempotencyKey: `correction:${correction.serviceDay}:${correction.handoffId}:${correction.sku}:${String(correction.totalCorrected)}`,
    occurredAt: correction.at,
    audience: AUDIENCE,
  };
}
