import type { MandateSchemeUsageView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { IssuedMandatesReader } from "../../domain/ports/issued-mandates.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { GetMandateSchemeUsageQuery } from "./get-mandate-scheme-usage.query.js";

/**
 * Le schéma courant de l'entité, et ce qu'elle a émis — pour que le dialogue de
 * confirmation nomme la conséquence en chiffres (plan
 * `documentation/comptabilite/plan-mandat-deux-schemas.md` §3.3).
 *
 * Les comptes viennent de `payments` par un port : la comptabilité ne lit pas
 * `payment_mandates`, ni en Prisma ni en SQL.
 *
 * @throws {LegalEntityNotFoundError} entité inconnue — avant de compter quoi que ce soit.
 */
@QueryHandler(GetMandateSchemeUsageQuery)
export class GetMandateSchemeUsageHandler implements IQueryHandler<
  GetMandateSchemeUsageQuery,
  MandateSchemeUsageView
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly mandates: IssuedMandatesReader,
  ) {}

  async execute({ legalEntityId }: GetMandateSchemeUsageQuery): Promise<MandateSchemeUsageView> {
    const entity = await this.entities.byId(legalEntityId);
    if (entity === null) {
      throw new LegalEntityNotFoundError(legalEntityId);
    }
    const usage = await this.mandates.usageOf(legalEntityId);
    return {
      scheme: entity.mandateScheme,
      activeByScheme: { CORE: usage.activeByScheme.CORE, B2B: usage.activeByScheme.B2B },
      drafts: usage.drafts,
    };
  }
}
