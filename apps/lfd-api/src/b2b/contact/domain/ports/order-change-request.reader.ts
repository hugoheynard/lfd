import type { OrderChangeRequestStatusView } from "@lfd/contracts";

/** Port de **lecture** des demandes de modification d'une commande, pour le client et la garde d'unicité. */
export abstract class OrderChangeRequestReader {
  /** La plus récente demande de modification de cette commande, ou `null`. */
  abstract latestFor(orderId: string): Promise<OrderChangeRequestStatusView | null>;
  /** Une demande attend-elle déjà la réponse du commerce ? */
  abstract hasPending(orderId: string): Promise<boolean>;
}
