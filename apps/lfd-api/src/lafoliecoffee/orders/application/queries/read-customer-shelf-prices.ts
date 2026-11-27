import type { CustomerShelfPricesView, ShopItemView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { RecognisedShelf } from "../../../catalog/application/recognised-shelf.service.js";
import { servedCompanyServiceOf } from "../../../catalog/domain/company-service.js";
import { ServedCompanyReader } from "../../../catalog/domain/ports/served-company.reader.js";
import { ShelfOptionGroupsReader } from "../../../catalog/domain/ports/shelf-option-groups.reader.js";
import { optionGroupViewOf } from "../../../catalog/application/queries/read-shop-option-groups.handler.js";
import { OrderCompanyNotFoundError } from "../../domain/errors/order-errors.js";
import {
  StaffEntryCompanyArchivedError,
  StaffEntryCompanyClosedError,
} from "../../domain/errors/staff-entry-company-closed.error.js";

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
    private readonly options: ShelfOptionGroupsReader,
  ) {}

  /**
   * @throws {OrderCompanyNotFoundError} la société est inconnue.
   * @throws {StaffEntryCompanyClosedError} la société est résiliée.
   * @throws {StaffEntryCompanyArchivedError} la société est supprimée.
   */
  async execute({ companyId }: ReadCustomerShelfPricesQuery): Promise<CustomerShelfPricesView> {
    const served = await this.companies.servedOf(companyId);
    if (served === null) {
      throw new OrderCompanyNotFoundError(companyId);
    }
    const service = servedCompanyServiceOf(served);
    if (service === "closed") {
      throw served.archivedAt === null
        ? new StaffEntryCompanyClosedError(companyId)
        : new StaffEntryCompanyArchivedError(companyId);
    }
    const [view, offered] = await Promise.all([
      this.shelf.read(companyId),
      // Les options à la clientèle du CLIENT (`plan-options-de-commande.md`,
      // § 3.3) : l'équipe qui saisit applique la sienne, jamais celle du staff.
      this.options.offeredTo(service),
    ]);
    return {
      items: view.items.map((item) => {
        const groups = offered.get(item.sku);
        return groups === undefined
          ? shelfPriceOf(item)
          : { ...shelfPriceOf(item), optionGroups: groups.map(optionGroupViewOf) };
      }),
      audience: service,
    };
  }
}

/**
 * Une ligne du rayon, telle que la liste de l'équipe la pose — partagée avec
 * le rayon du particulier au comptoir (`read-counter-particular-shelf-prices.ts`) :
 * les deux tables tirent le même nombre du même rayon.
 */
export function shelfPriceOf(item: ShopItemView): CustomerShelfPricesView["items"][number] {
  return {
    sku: item.sku,
    unitPriceMillicents: item.unitPriceMillicents,
    struckFromMillicents: item.catalogPriceMillicents ?? null,
    unitPriceTtcCents: item.unitPriceTtcCents,
    struckFromTtcCents: item.catalogPriceTtcCents ?? null,
    lockedReason: item.lockedReason ?? null,
  };
}
