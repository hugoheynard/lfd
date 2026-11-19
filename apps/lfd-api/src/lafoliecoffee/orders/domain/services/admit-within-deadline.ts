import type { LateFeeAdjustment } from "@lfd/contracts";

import type { ExceededItemLimit, OrderDeadlineVerdict } from "../../../order-cutoffs/index.js";
import { OrderCutoffGraceError, PastOrderCutoffError } from "../errors/order-errors.js";

/**
 * Ce qu'une passation admise doit à son retard : la dérogation à dépenser, son
 * prix, et les limites d'article que l'équipe a passées.
 */
export interface DeadlineAdmission {
  /** La dérogation à consommer dans la transaction de la commande, ou `null`. */
  readonly waiverUsed: string | null;
  /** La surtaxe que la commande portera, ou `null`. */
  readonly lateFee: LateFeeAdjustment | null;
  /**
   * Les limites d'article dépassées, à justifier puis à consigner avec la
   * commande. Vide sans le droit de passer outre.
   */
  readonly exceeded: readonly ExceededItemLimit[];
}

/** Une admission qui ne doit rien : ni dérogation, ni surtaxe, ni dépassement. */
export const NOTHING_OWED: DeadlineAdmission = { waiverUsed: null, lateFee: null, exceeded: [] };

/**
 * **La passation applique le verdict du délai de commande** : elle laisse
 * passer, passe sur une dérogation, ou refuse. Une admission rend les limites
 * d'article que le verdict a vu dépasser : la passation les fait justifier et
 * les consigne, elle ne les rejuge pas.
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
      return { ...NOTHING_OWED, exceeded: verdict.exceeded };
    case "grace":
      if (verdict.waiver !== null) {
        return {
          waiverUsed: verdict.waiver.id,
          lateFee: verdict.lateFee,
          exceeded: verdict.exceeded,
        };
      }
      if (verdict.graceEnd !== null) {
        throw new OrderCutoffGraceError(serviceDay, verdict.graceEnd);
      }
      throw new PastOrderCutoffError(serviceDay);
    case "closed":
      throw new PastOrderCutoffError(serviceDay);
  }
}
