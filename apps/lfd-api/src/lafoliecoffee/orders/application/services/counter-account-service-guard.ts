import type { FulfillmentMethod } from "@lfd/contracts";

import {
  CounterAccountBackorderRefusedError,
  CounterAccountDeliveryRefusedError,
} from "../../domain/errors/counter-account-service.errors.js";
import type { CompanyStatusReader } from "../../domain/ports/company-status.reader.js";
import {
  isCounterAccount,
  servesCounterAccount,
} from "../../domain/services/counter-account-service.js";

type Statuses = Pick<CompanyStatusReader, "companyStatusOf">;

/**
 * **Ce que sert un compte ouvert au comptoir** (`plan-comptes-du-comptoir.md`,
 * § 3.7) : le retrait seul. Le statut n'est lu que pour un autre mode — un
 * retrait ne coûte aucune lecture.
 *
 * @throws {CounterAccountDeliveryRefusedError}
 */
export async function ensureCounterAccountFulfillment(
  statuses: Statuses,
  companyId: string,
  method: FulfillmentMethod,
): Promise<void> {
  if (servesCounterAccount(method)) {
    return;
  }
  if (isCounterAccount(await statuses.companyStatusOf(companyId))) {
    throw new CounterAccountDeliveryRefusedError();
  }
}

/**
 * Un compte ouvert au comptoir n'a pas de reliquat (§ 3.7) : ni transformé,
 * ni estimé. Une commande de particulier (sans société) n'est pas concernée.
 *
 * @throws {CounterAccountBackorderRefusedError}
 */
export async function ensureNotCounterAccountBackorder(
  statuses: Statuses,
  companyId: string | null,
): Promise<void> {
  if (companyId !== null && isCounterAccount(await statuses.companyStatusOf(companyId))) {
    throw new CounterAccountBackorderRefusedError();
  }
}
