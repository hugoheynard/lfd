import type { CustomerShelfPricesView, ShopItemView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { RecognisedShelf } from "../../../catalog/application/recognised-shelf.service.js";
import { companyServiceOf } from "../../../catalog/domain/company-service.js";
import { ServedCompanyReader } from "../../../catalog/domain/ports/served-company.reader.js";
import { OrderCompanyNotFoundError } from "../../domain/errors/order-errors.js";
import { StaffEntryCompanyClosedError } from "../../domain/errors/staff-entry-company-closed.error.js";

/**
 * **Les prix du rayon d'un client, pour la saisie de l'équipe** (plan
 * `documentation/commandes/passation/plan-liste-au-prix-du-client.md`, L1).
 *
 * La table ne recalcule rien : elle lit le MÊME rayon, sous la MÊME clé et au
 * même cache que la route reconnue du client (`read-my-shop-catalogue.ts`).
 * La clé du client est la société que `@ActingCompany` résout — la société
 * elle-même, site compris, jamais son principal (`resolve-company.ts`) ; le
 * rayon tarife ensuite un site par ses détenteurs. La clé du staff est donc
 * l'identifiant de la société, une fois lu en base.
 *
 * 🔴 **La société est lue AVANT le rayon.** Sans cette lecture, une société
 * inconnue serait servie au public et son rayon rangé sous un identifiant venu
 * de l'URL ; une société terminée ne se tarife plus, et la passation la
 * refuserait — la table la refuse de même, sans rien lire, par un refus
 * écrit pour le personnel.
 */
export class ReadCustomerShelfPricesQuery {
  constructor(readonly companyId: string) {}
}

@QueryHandler(ReadCustomerShelfPricesQuery)
export class ReadCustomerShelfPricesHandler implements IQueryHandler<
  ReadCustomerShelfPricesQuery,
  CustomerShelfPricesView
> {
  constructor(
    private readonly companies: ServedCompanyReader,
    private readonly shelf: RecognisedShelf,
  ) {}

  /**
   * @throws {OrderCompanyNotFoundError} la société est inconnue.
   * @throws {StaffEntryCompanyClosedError} la société est terminée.
   */
  async execute({ companyId }: ReadCustomerShelfPricesQuery): Promise<CustomerShelfPricesView> {
    const served = await this.companies.servedOf(companyId);
    if (served === null) {
      throw new OrderCompanyNotFoundError(companyId);
    }
    const service = companyServiceOf(served.status);
    if (service === "closed") {
      throw new StaffEntryCompanyClosedError(companyId);
    }
    const view = await this.shelf.read(companyId);
    return { items: view.items.map(priceOf), audience: service };
  }
}

function priceOf(item: ShopItemView): CustomerShelfPricesView["items"][number] {
  return {
    sku: item.sku,
    unitPriceMillicents: item.unitPriceMillicents,
    struckFromMillicents: item.catalogPriceMillicents ?? null,
    unitPriceTtcCents: item.unitPriceTtcCents,
    struckFromTtcCents: item.catalogPriceTtcCents ?? null,
    lockedReason: item.lockedReason ?? null,
  };
}
