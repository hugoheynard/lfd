import { Global, Module } from "@nestjs/common";

import {
  DepartedOrdersAnnouncer,
  DepartureHoldsReader,
  DoorstepHandoverAttestor,
} from "../delivery/channels/handover/index.js";
import { HandoverDepartedOrders } from "../handover/application/services/handover-departed-orders.js";
import { HandoverDepartureHolds } from "../handover/application/services/handover-departure-holds.js";
import { HandoverDoorstepAttestor } from "../handover/application/services/handover-doorstep-attestor.js";
import { HandoverModule } from "../handover/handover.module.js";

/**
 * **Le fil de la garde, relié** (2026-10-01, `plan-a-la-porte.md`, BQ) — la
 * livraison déclare, le retrait implémente :
 *
 * - `DepartureHoldsReader` — au départ, « lesquelles sont retenues ? » ;
 * - `DepartedOrdersAnnouncer` — après la validation du départ, « elles sont
 *   parties » ;
 * - `DoorstepHandoverAttestor` — à la porte, « atteste cette remise », sans
 *   publier (B1).
 *
 * Les deux adaptateurs vivent dans `HandoverModule`, qui a ses ports : d'où
 * l'import, et `useExisting`. `@Global` pour la raison des autres fils : le
 * consommateur est `delivery/`, qui ne peut pas importer le retrait.
 */
@Global()
@Module({
  imports: [HandoverModule],
  providers: [
    { provide: DepartureHoldsReader, useExisting: HandoverDepartureHolds },
    { provide: DepartedOrdersAnnouncer, useExisting: HandoverDepartedOrders },
    { provide: DoorstepHandoverAttestor, useExisting: HandoverDoorstepAttestor },
  ],
  exports: [DepartureHoldsReader, DepartedOrdersAnnouncer, DoorstepHandoverAttestor],
})
export class DeliveryHandoverFeedModule {}
