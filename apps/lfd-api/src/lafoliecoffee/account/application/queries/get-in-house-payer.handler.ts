import type { InHousePayerView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { InHouseDeclarationReader } from "../../domain/ports/in-house-declaration.reader.js";
import { GetInHousePayerQuery } from "./get-in-house-payer.query.js";

/**
 * La nature « maison » pour la fiche client.
 *
 * @throws {CompanyNotFoundError} la société n'existe pas.
 */
@QueryHandler(GetInHousePayerQuery)
export class GetInHousePayerHandler implements IQueryHandler<
  GetInHousePayerQuery,
  InHousePayerView
> {
  constructor(private readonly declarations: InHouseDeclarationReader) {}

  async execute(query: GetInHousePayerQuery): Promise<InHousePayerView> {
    const state = await this.declarations.stateOf(query.companyId);
    if (state === null) {
      throw new CompanyNotFoundError(query.companyId);
    }
    return {
      companyId: query.companyId,
      inHouse: state.declaredAt !== null,
      declaredAt: state.declaredAt?.toISOString() ?? null,
    };
  }
}
