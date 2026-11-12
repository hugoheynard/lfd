import type { GlobalVersionSubject, StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { GlobalVersionSource } from "../../../../platform/day-versions/global-version-source.js";
import { OrderChangeVersionReader } from "../../domain/ports/order-change-version.reader.js";

/** La fenêtre de `orders-all` : celle des journées (`le-cache-du-back-office.md`, § 2.1). */
export const ALL_ORDERS_FRESH_MS = 15_000;

/**
 * **Toutes les commandes**, pour la porte des versions
 * (`le-cache-du-back-office.md`, § 2.2–2.3) : le numéro du journal
 * `public.order_change`, sans condition de date.
 *
 * Sous `b2b_orders:read` SEUL — jamais sous les droits du journal `orders`
 * (comptoir, Supervision), qui liraient l'activité de toutes les journées.
 */
@Injectable()
export class AllOrdersVersionSource extends GlobalVersionSource {
  readonly subject: GlobalVersionSubject = "orders-all";
  readonly readers: readonly [StaffPermission, ...StaffPermission[]] = ["b2b_orders:read"];
  readonly freshMs = ALL_ORDERS_FRESH_MS;

  constructor(private readonly versions: OrderChangeVersionReader) {
    super();
  }

  versionOf(): Promise<number> {
    return this.versions.versionOf();
  }
}
