import type { DayJournal, StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DayVersionSource } from "../../../../platform/day-versions/day-version-source.js";
import { OrderDayVersionReader } from "../../domain/ports/order-day-version.reader.js";

/**
 * **Le journal du commerce** pour la porte unique des versions de journée
 * (`version-par-journee.md`, D8) : `public.day_change`, avancé par les
 * déclencheurs de `orders` quel que soit l'écrivain — passation, règlement,
 * annulation, retrait (D1).
 *
 * Lisible sous l'un des TROIS droits qu'ouvraient ses anciennes portes
 * (relevés le 2026-11-03 dans `admin-supervision.controller.ts` et
 * `admin-orders.controller.ts`) : `b2b_supervision:read` (la Supervision),
 * `b2b_orders:read` et `handover_counter:read` (le comptoir, audit
 * `livraisons/audit-2026-10-07.md`, B6), et `production_worksheet:read` /
 * `production_plan:read` : la fiche du fournil se relit quand une commande du
 * jour change, et elle en montre déjà les quantités. Un numéro de journée n'est pas une
 * commande : il ne dit rien de ce qui est commandé ni de qui commande.
 */
@Injectable()
export class OrdersDayVersionSource extends DayVersionSource {
  readonly journal: DayJournal = "orders";
  readonly readers: readonly [StaffPermission, ...StaffPermission[]] = [
    "b2b_orders:read",
    "handover_counter:read",
    "b2b_supervision:read",
    "production_worksheet:read",
    "production_plan:read",
  ];

  constructor(private readonly versions: OrderDayVersionReader) {
    super();
  }

  versionOf(serviceDay: string): Promise<number> {
    return this.versions.versionOf(serviceDay);
  }
}
