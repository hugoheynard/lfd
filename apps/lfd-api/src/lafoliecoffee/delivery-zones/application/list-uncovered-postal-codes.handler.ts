import type { UncoveredPostalCodeView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DeliveryPostalCodesReader } from "../../account/domain/ports/delivery-postal-codes.reader.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import { uncoveredPostalCodes } from "../domain/uncovered-postal-codes.js";
import { ListUncoveredPostalCodesQuery } from "./list-uncovered-postal-codes.query.js";

/**
 * Rapproche les adresses de livraison des comptes servis (lues par le port
 * qu'`account/` implémente) des zones. Lecture pure.
 */
@QueryHandler(ListUncoveredPostalCodesQuery)
export class ListUncoveredPostalCodesHandler implements IQueryHandler<
  ListUncoveredPostalCodesQuery,
  readonly UncoveredPostalCodeView[]
> {
  constructor(
    private readonly zones: DeliveryZoneRepository,
    private readonly addresses: DeliveryPostalCodesReader,
  ) {}

  async execute(): Promise<readonly UncoveredPostalCodeView[]> {
    const [zones, holders] = await Promise.all([
      this.zones.list(),
      this.addresses.ofServedCompanies(),
    ]);
    return uncoveredPostalCodes(
      zones.map((zone) => zone.postalPrefixes),
      holders,
    );
  }
}
