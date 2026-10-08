import type { DeliveryVatMode } from "@lfd/contracts";

import { OrderDeliveryVatRepository } from "../../domain/order-delivery-vat.repository.js";

/** Le réglage unique de la TVA du port, en mémoire — et l'ordre de ce qu'on lui a fait. */
export class InMemoryDeliveryVat extends OrderDeliveryVatRepository {
  current: DeliveryVatMode | null = null;
  readonly log: string[] = [];

  read(): Promise<DeliveryVatMode | null> {
    this.log.push("read");
    return Promise.resolve(this.current);
  }

  save(mode: DeliveryVatMode, updatedBy: string): Promise<void> {
    this.log.push(`save:${mode}:${updatedBy}`);
    this.current = mode;
    return Promise.resolve();
  }
}
