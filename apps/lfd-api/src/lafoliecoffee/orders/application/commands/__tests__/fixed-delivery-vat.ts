import type { DeliveryVatMode } from "@lfd/contracts";

import { OrderDeliveryVatReader } from "../../../domain/ports/order-delivery-vat.reader.js";

/**
 * Le mode de TVA du port, fixé par le test — `standard` par défaut, le repli du
 * vrai lecteur sans réglage posé. Compte ses lectures : le devis et la
 * passation doivent le lire, pas le deviner.
 */
export class FixedDeliveryVat extends OrderDeliveryVatReader {
  reads = 0;

  constructor(private readonly mode: DeliveryVatMode = "standard") {
    super();
  }

  current(): Promise<DeliveryVatMode> {
    this.reads += 1;
    return Promise.resolve(this.mode);
  }
}
