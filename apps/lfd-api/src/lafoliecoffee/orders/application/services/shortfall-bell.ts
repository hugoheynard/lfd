import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { FIRST_SHIPMENT_RANK } from "../../../../production/channels/commerce/index.js";

/** Ceux qui décident d'un manque : le droit de la décision, pas celui de la lire. */
const AUDIENCE: StaffPermission = "b2b_orders_shortfall:write";

/** Le genre de la cloche. */
export const SHORTFALL_BELL = "order.shortfall_reported";

const RUNG = "order-shortfall-bell";

/** La clé de la cloche : une par signalement (envoi et instant du fait). */
export function shortfallBellKey(orderId: string, rank: number, reportedAt: Date): string {
  return `manque:${orderId}:${String(rank)}:${reportedAt.toISOString()}`;
}

/** Le signalement que la cloche annonce. */
export interface RungShortfall {
  readonly orderId: string;
  readonly rank: number;
  /** Le numéro de la commande. */
  readonly reference: string;
  readonly reportedAt: Date;
}

/**
 * **La cloche d'un manque signalé** (D8 du plan
 * `documentation/colisage/plan-niveaux-de-suivi-colisage.md`) : elle sonne
 * chez qui décide (`b2b_orders_shortfall:write`), parce que le comptoir
 * attend sa décision pour remettre la commande.
 *
 * Après validation (`AfterCommit`) : un manque dont l'enregistrement est
 * annulé ne sonne pas. Une fois par signalement : la clé porte l'instant du
 * fait, et un fait rejoué ne change pas l'état, donc ne sonne pas.
 */
@Injectable()
export class ShortfallBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  ringAfterCommit(shortfall: RungShortfall): void {
    const notice = noticeOf(shortfall);
    this.afterCommit.defer(() => this.work.track(this.notifier.notify([notice]), RUNG), RUNG);
  }
}

function noticeOf(shortfall: RungShortfall): StaffNotice {
  const what =
    shortfall.rank === FIRST_SHIPMENT_RANK
      ? `la commande ${shortfall.reference}`
      : `le reste (envoi ${String(shortfall.rank)}) de la commande ${shortfall.reference}`;
  return {
    kind: SHORTFALL_BELL,
    subject: `Manque signalé — ${shortfall.reference}`,
    body: `Le colisage signale qu'il manque des produits pour ${what} : votre décision est attendue, et le comptoir ne remet pas la commande avant. Ouvrez-la pour valider un départ incomplet.`,
    link: `/commandes/${shortfall.orderId}`,
    idempotencyKey: shortfallBellKey(shortfall.orderId, shortfall.rank, shortfall.reportedAt),
    occurredAt: shortfall.reportedAt,
    audience: AUDIENCE,
  };
}
