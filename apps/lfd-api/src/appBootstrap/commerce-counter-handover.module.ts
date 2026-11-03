import { Global, Module } from "@nestjs/common";

import { AttestingCounterHandoverDesk } from "../handover/application/services/attesting-counter-handover.desk.js";
import { CounterHandoverDesk } from "../handover/channels/commerce/index.js";
import { HandoverModule } from "../handover/handover.module.js";

/**
 * **Le départ incomplet au comptoir, relié** (plan
 * `documentation/comptoir/plan-depart-incomplet-au-comptoir.md`, §4.2 —
 * Hugo, 2026-11-03) : le retrait déclare ET implémente `CounterHandoverDesk`,
 * le commerce l'appelle dans la transaction de sa décision.
 *
 * L'adaptateur vit dans `HandoverModule`, qui a ses ports : d'où l'import, et
 * `useExisting`. `@Global` pour la raison des autres fils : le consommateur
 * est `b2b/`, qui ne peut pas importer le retrait.
 */
@Global()
@Module({
  imports: [HandoverModule],
  providers: [{ provide: CounterHandoverDesk, useExisting: AttestingCounterHandoverDesk }],
  exports: [CounterHandoverDesk],
})
export class CommerceCounterHandoverModule {}
