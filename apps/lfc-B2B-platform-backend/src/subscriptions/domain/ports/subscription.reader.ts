import type { SubscriptionView } from "@lfd/contracts";

/**
 * Port de **lecture** des paniers récurrents du client. Vue dénormalisée : une
 * lecture ne rejoue aucune règle.
 */
export abstract class SubscriptionReader {
  abstract listForUser(userId: string): Promise<readonly SubscriptionView[]>;
}
