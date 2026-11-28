import type { FulfillmentMethod } from "@lfd/contracts";

import type { OrderCompanyStatus } from "../ports/company-status.reader.js";

/** Le seul mode qu'un compte ouvert au comptoir se fait servir (§ 3.7). */
const COUNTER_ACCOUNT_FULFILLMENT: FulfillmentMethod = "pickup";

/** Le statut d'un compte ouvert au comptoir. */
const COUNTER_OPENED: OrderCompanyStatus = "counter_opened";

/** Le mode est-il servi à un compte ouvert au comptoir ? Le retrait seul. */
export function servesCounterAccount(method: FulfillmentMethod): boolean {
  return method === COUNTER_ACCOUNT_FULFILLMENT;
}

/** La société est-elle un compte ouvert au comptoir ? */
export function isCounterAccount(status: OrderCompanyStatus | null): boolean {
  return status === COUNTER_OPENED;
}
