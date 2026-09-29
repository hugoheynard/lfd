import { Global, Module } from "@nestjs/common";

import { PickupAddressesModule } from "../b2b/pickup-addresses/pickup-addresses.module.js";
import { PickupDepartureCandidatesReader } from "../b2b/pickup-addresses/infrastructure/pickup-departure-candidates.reader.js";
import { DepartureCandidatesReader } from "../delivery/channels/commerce/index.js";

/**
 * **Le fil de la livraison, relié** : `DepartureCandidatesReader` — la
 * livraison déclare, le commerce implémente (les points de retrait candidats au
 * départ des tournées, `plan-preparation-de-tournee.md`, Q9).
 *
 * `@Global` pour la raison des autres fils : le consommateur est `delivery/`,
 * qui ne peut pas importer le module qui fournit le port sans dépendre du
 * commerce. Le jeton reste celui du contexte déclarant.
 */
@Global()
@Module({
  imports: [PickupAddressesModule],
  providers: [{ provide: DepartureCandidatesReader, useClass: PickupDepartureCandidatesReader }],
  exports: [DepartureCandidatesReader],
})
export class DeliveryFeedModule {}
