import { ContainerManagedOrders } from "../../../../packing/channels/delivery/index.js";

/** Les commandes gérées au colisage (K2b) : celles qu'on nomme, aucune par défaut. */
export class FixedManagedOrders extends ContainerManagedOrders {
  private readonly managed: ReadonlySet<string>;

  constructor(...orderIds: readonly string[]) {
    super();
    this.managed = new Set(orderIds);
  }

  isManaged(orderId: string): Promise<boolean> {
    return Promise.resolve(this.managed.has(orderId));
  }
}
