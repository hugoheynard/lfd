import { Global, Module } from "@nestjs/common";

import {
  ResupplyTransfersReader,
  TransferReceptionDesk,
  TransferStatusReader,
} from "../delivery/channels/handover/index.js";
import { TransferReception } from "../delivery/application/transfer-reception.js";
import { DeliveryModule } from "../delivery/delivery.module.js";
import { TransferArrivalStatus } from "../delivery/application/transfer-arrival-status.js";
import { ResupplyTransfersAtCounter } from "../delivery/application/resupply-transfers-at-counter.js";

/**
 * **Le transfert interne, vu du comptoir, relié** (plan du transfert interne,
 * lot T2, 2026-10-13) — la livraison déclare et implémente « arrivée au
 * site ? » et « réceptionner » ; le retrait les lit. `@Global` pour la
 * raison de `DeliveryRoundPlacementsModule` : le retrait ne peut pas importer
 * `DeliveryModule`.
 */
@Global()
@Module({
  imports: [DeliveryModule],
  providers: [
    { provide: TransferStatusReader, useExisting: TransferArrivalStatus },
    { provide: TransferReceptionDesk, useExisting: TransferReception },
    { provide: ResupplyTransfersReader, useExisting: ResupplyTransfersAtCounter },
  ],
  exports: [TransferStatusReader, TransferReceptionDesk, ResupplyTransfersReader],
})
export class DeliveryTransferCounterModule {}
