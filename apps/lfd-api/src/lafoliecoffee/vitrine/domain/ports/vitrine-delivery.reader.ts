import type { VitrineDeliveryView } from "@lfd/contracts";

/** Port de lecture du journal des envois. */
export abstract class VitrineDeliveryReader {
  /** Les envois d'un abonné, du plus récent au plus ancien, bornés. */
  abstract listForSubscriber(
    subscriberId: string,
    limit: number,
  ): Promise<readonly VitrineDeliveryView[]>;
}
