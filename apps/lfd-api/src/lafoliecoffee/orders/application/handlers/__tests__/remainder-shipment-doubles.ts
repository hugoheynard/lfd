import {
  RemainderShipmentReader,
  type RemainderShipment,
} from "../../../domain/ports/remainder-shipment.reader.js";

/**
 * Les restes connus, par `<orderId>:<rang>`. Un rang 1 demandé ici est une
 * faute de l'appelant : le premier envoi se lit sur la commande.
 */
export class FixedRemainders extends RemainderShipmentReader {
  readonly asked: string[] = [];

  constructor(private readonly shipments: ReadonlyMap<string, RemainderShipment> = new Map()) {
    super();
  }

  find(orderId: string, rank: number): Promise<RemainderShipment | null> {
    const key = `${orderId}:${String(rank)}`;
    this.asked.push(key);
    return Promise.resolve(this.shipments.get(key) ?? null);
  }
}
