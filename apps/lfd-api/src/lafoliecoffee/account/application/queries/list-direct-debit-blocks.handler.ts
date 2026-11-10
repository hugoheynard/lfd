import type { DirectDebitBlockDetailView, DirectDebitBlockView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  DirectDebitBlockReader,
  type CreditedCompanyEntry,
} from "../../domain/ports/direct-debit-block.reader.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import { ListDirectDebitBlocksQuery } from "./list-direct-debit-blocks.query.js";

/**
 * Liste les sociétés au crédit mensuel, avec leur blocage éventuel.
 *
 * L'auteur d'un blocage n'est rangé que par l'id de sa fiche ; son nom se
 * résout ici, à la lecture, par l'annuaire — seulement pour les lignes
 * bloquées, qui sont l'exception.
 */
@QueryHandler(ListDirectDebitBlocksQuery)
export class ListDirectDebitBlocksHandler implements IQueryHandler<
  ListDirectDebitBlocksQuery,
  readonly DirectDebitBlockView[]
> {
  constructor(
    private readonly reader: DirectDebitBlockReader,
    private readonly staff: StaffDirectory,
  ) {}

  async execute(): Promise<readonly DirectDebitBlockView[]> {
    const entries = await this.reader.listCredited();
    return Promise.all(entries.map((entry) => this.toView(entry)));
  }

  private async toView(entry: CreditedCompanyEntry): Promise<DirectDebitBlockView> {
    return {
      companyId: entry.companyId,
      reference: entry.reference,
      raisonSociale: entry.raisonSociale,
      enseigne: entry.enseigne,
      block: entry.block === null ? null : await this.detail(entry.block),
    };
  }

  private async detail(
    block: NonNullable<CreditedCompanyEntry["block"]>,
  ): Promise<DirectDebitBlockDetailView> {
    // Une fiche inconnue de l'annuaire : `null`, jamais un nom inventé.
    const agent = await this.staff.identify(block.blockedByStaffId);
    return {
      blockedAt: block.blockedAt.toISOString(),
      blockedBy: agent === null ? null : { name: agent.name, role: agent.role },
      reason: block.reason,
    };
  }
}
