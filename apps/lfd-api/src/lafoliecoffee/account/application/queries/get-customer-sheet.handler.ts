import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { CustomerSheetView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CustomerSheetReader } from "../../domain/ports/customer-sheet.reader.js";
import { GetCustomerSheetQuery } from "./get-customer-sheet.query.js";

/**
 * Rend la fiche, ou un 404. Le `now` vient du **Clock** et non du lecteur : les
 * deux fenêtres de tendance sont une décision métier (« 30 jours »), pas un
 * détail d'infrastructure — et c'est ce qui rend la lecture testable à date fixe.
 */
@QueryHandler(GetCustomerSheetQuery)
export class GetCustomerSheetHandler implements IQueryHandler<
  GetCustomerSheetQuery,
  CustomerSheetView
> {
  constructor(
    private readonly sheets: CustomerSheetReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetCustomerSheetQuery): Promise<CustomerSheetView> {
    const sheet = await this.sheets.read(query.companyId, this.clock.now());
    if (sheet === null) {
      throw new CompanyNotFoundError(query.companyId);
    }
    return sheet;
  }
}
