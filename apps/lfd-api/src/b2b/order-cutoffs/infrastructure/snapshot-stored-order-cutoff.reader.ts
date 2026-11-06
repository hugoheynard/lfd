import type { OrderCutoffView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { CatalogueSnapshotStore } from "../../catalog/infrastructure/catalogue-snapshot/catalogue-snapshot.store.js";
import { StoredOrderCutoffReader } from "../domain/stored-order-cutoff.reader.js";
import { PrismaStoredOrderCutoffReader } from "./prisma-stored-order-cutoff.reader.js";

/**
 * **L'heure limite générale sur l'instantané du catalogue** — le morceau
 * `order_cutoffs`, rangé sous le numéro de ce contexte
 * (`plan-materiaux-du-catalogue.md`, § 2.1, § 2.3). Hors de la portée de
 * l'instantané (passation, écrans, tâches de fond), la base comme avant.
 */
@Injectable()
export class SnapshotStoredOrderCutoffReader extends StoredOrderCutoffReader {
  constructor(
    private readonly base: PrismaStoredOrderCutoffReader,
    private readonly store: CatalogueSnapshotStore,
  ) {
    super();
  }

  async general(): Promise<OrderCutoffView | null> {
    if (!this.store.serves()) {
      return this.base.general();
    }
    const row = await this.store.generalCutoff();
    return row === null
      ? null
      : {
          id: row.id,
          pickupAddressId: null,
          pickupLabel: null,
          weekday: null,
          daysBefore: row.daysBefore,
          time: row.time,
          graceMinutes: row.graceMinutes,
        };
  }
}
