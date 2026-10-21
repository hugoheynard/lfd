import type { CompanyOrderSummaryView } from "@lfd/contracts";

import { OrderCompanyNotFoundError } from "../../domain/errors/order-errors.js";
import type { CompanyOrderSummaryReader } from "../../domain/ports/company-order-summary.reader.js";
import type { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import type { OrderSummaryRequesterReader } from "../../domain/ports/order-summary-requester.reader.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import {
  ensureAllSummarized,
  summarizeOrders,
  summarySelectionOf,
} from "../../domain/services/order-summary.js";

/** Qui demande le récapitulatif, pour quelle société, et quelles commandes. */
export interface CompanyOrderSummaryRequestScope {
  readonly actorUserId: string;
  readonly companyId: string;
  readonly orderIds: readonly string[];
}

/**
 * Le récapitulatif, PARTAGÉ par ses trois formats (`plan-recapitulatif-des-commandes.md`,
 * §6.5) : membre de la société d'abord, plafond ensuite — les deux AVANT toute
 * lecture —, puis UNE lecture sous le mur de la liste. Un id absent du
 * résultat est hors du mur : refus qui le nomme, jamais un récapitulatif
 * partiel. Le PDF et le tableur dessinent CE résultat, sans relecture.
 */
export async function loadCompanyOrderSummary(
  guard: OrderGuardReader,
  orders: CompanyOrderSummaryReader,
  scope: CompanyOrderSummaryRequestScope,
): Promise<CompanyOrderSummaryView> {
  const role = await guard.roleOf(scope.actorUserId, scope.companyId);
  ensureOrderMember(role, scope.companyId);
  const orderIds = summarySelectionOf(scope.orderIds);

  const sources = await orders.ordersFor({
    actorUserId: scope.actorUserId,
    companyId: scope.companyId,
    orderIds,
  });
  ensureAllSummarized(orderIds, sources);
  return summarizeOrders(scope.companyId, sources);
}

/**
 * Le nom de la société demandeuse, pour l'en-tête et le nom du fichier. Lu
 * APRÈS {@link loadCompanyOrderSummary}, qui a vérifié l'appartenance : une
 * société absente à ce stade a disparu entre deux lectures.
 *
 * @throws {OrderCompanyNotFoundError} la société n'existe plus.
 */
export async function summaryRequesterName(
  requester: OrderSummaryRequesterReader,
  companyId: string,
): Promise<string> {
  const name = await requester.nameOf(companyId);
  if (name === null) {
    throw new OrderCompanyNotFoundError(companyId);
  }
  return name;
}
