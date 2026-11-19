import type { LateFeeAdjustment } from "@lfd/contracts";

import type { OrderDeadlineVerdict } from "../../../order-cutoffs/index.js";
import { OrderCutoffGraceError, PastOrderCutoffError } from "../errors/order-errors.js";

/** Ce qu'une passation admise doit à son retard : la dérogation à dépenser, et son prix. */
export interface DeadlineAdmission {
  /** La dérogation à consommer dans la transaction de la commande, ou `null`. */
  readonly waiverUsed: string | null;
  /** La surtaxe que la commande portera, ou `null`. */
  readonly lateFee: LateFeeAdjustment | null;
}

const ON_TIME: DeadlineAdmission = { waiverUsed: null, lateFee: null };

/**
 * **La passation applique le verdict du délai de commande** : elle laisse
 * passer, passe sur une dérogation, ou refuse.
 *
 * Les refus sont ceux de la passation, et leurs codes ne changent pas : les
 * écrans les trient par code. Dans le rattrapage sans dérogation, le refus
 * dit « appelez-nous » et porte la fin du rattrapage ; après, « choisissez une
 * autre date ».
 *
 * @throws {OrderCutoffGraceError} rattrapage en cours, aucune dérogation.
 * @throws {PastOrderCutoffError} limite et rattrapage passés.
 */
export function admitWithinDeadline(
  verdict: OrderDeadlineVerdict,
  serviceDay: string,
): DeadlineAdmission {
  switch (verdict.kind) {
    case "open":
      return ON_TIME;
    case "grace":
      if (verdict.waiver !== null) {
        return { waiverUsed: verdict.waiver.id, lateFee: verdict.lateFee };
      }
      if (verdict.graceEnd !== null) {
        throw new OrderCutoffGraceError(serviceDay, verdict.graceEnd);
      }
      throw new PastOrderCutoffError(serviceDay);
    case "closed":
      throw new PastOrderCutoffError(serviceDay);
  }
}
