import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { StaffNotifier } from "../../staff/notifications/domain/ports/staff-notifier.js";

/**
 * Qui reçoit : ceux qui composent les tournées — affecter un transfert à une
 * tournée est sous `delivery_rounds:write`, comme la cloche du plan arrêté.
 */
const AUDIENCE: StaffPermission = "delivery_rounds:write";

const KIND = "delivery.asap_transfer_unplaced";

/** Ce que la cloche dit d'un transfert « au plus tôt » resté sans tournée. */
export interface AsapTransferUnplacedNotice {
  readonly serviceDay: string;
  readonly resupplyId: string;
  /** Le nom du réassort (R1g), ou `null`. */
  readonly resupplyName: string | null;
  readonly siteLabel: string;
  readonly at: Date;
}

/**
 * **La cloche du répartiteur : un réassort « au plus tôt » n'a pas de
 * tournée** (R4c, `reassort-boutiques/plan-au-plus-tot.md` §2 ④, §6).
 *
 * Le placement automatique laisse un transfert sans arrêt quand aucune
 * tournée ne passe et qu'aucun véhicule n'est libre (ou que le point n'a pas
 * de position) ; le soir, le Tour manager le montre et personne n'est
 * pressé. Un « au plus tôt » l'est : sans cette cloche, il n'arriverait
 * jamais. Appelée HORS transaction, après le placement de fond : elle sonne
 * directement. Clé par réassort : un fait rejoué ne sonne qu'une fois.
 */
@Injectable()
export class AsapTransferUnplacedBell {
  constructor(private readonly notifier: StaffNotifier) {}

  ring(notice: AsapTransferUnplacedNotice): Promise<void> {
    const what =
      notice.resupplyName === null
        ? `Le réassort « au plus tôt » de ${notice.siteLabel}`
        : `« ${notice.resupplyName} » (${notice.siteLabel}, au plus tôt)`;
    return this.notifier.notify([
      {
        kind: KIND,
        subject: `Réassort au plus tôt sans tournée — ${notice.siteLabel}`,
        body:
          `${what} est lancé, mais aucune tournée ne l'emporte : aucun véhicule libre ` +
          `le ${notice.serviceDay}, ou point sans position. Affectez son transfert à une ` +
          `tournée ; à défaut, le comptoir le réceptionnera à la main.`,
        link: `/livraison/tournees?jour=${notice.serviceDay}`,
        idempotencyKey: `notification:${KIND}:${notice.resupplyId}`,
        occurredAt: notice.at,
        audience: AUDIENCE,
      },
    ]);
  }
}
