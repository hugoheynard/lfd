import { Global, Module } from "@nestjs/common";

import {
  DepartureHoldsReader,
  DoorstepHandoverAttestor,
} from "../delivery/channels/handover/index.js";
import { HandoverDepartureHolds } from "../handover/application/services/handover-departure-holds.js";
import { HandoverDoorstepAttestor } from "../handover/application/services/handover-doorstep-attestor.js";
import { HandoverModule } from "../handover/handover.module.js";

/**
 * **Le fil de la garde, relié** (2026-10-01, `a-la-porte.md`, BQ) — la
 * livraison déclare, le retrait implémente :
 *
 * - `DepartureHoldsReader` — au départ, « lesquelles sont retenues ? » ;
 * - `DoorstepHandoverAttestor` — à la porte, « atteste cette remise », sans
 *   publier (B1).
 *
 * « Elles sont parties » et « elles sont revenues » ne passent plus par ici
 * depuis le 2026-10-06 (`plan-depart-durable.md`, DD1) : ce sont des faits
 * durables de la livraison, auxquels le retrait s'abonne lui-même.
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
    { provide: DoorstepHandoverAttestor, useExisting: HandoverDoorstepAttestor },
  ],
  exports: [DepartureHoldsReader, DoorstepHandoverAttestor],
})
export class DeliveryHandoverFeedModule {}
