import type { ActivationGate } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { AdminCompanyReader } from "../../domain/ports/admin-company.reader.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { activationGate } from "../../domain/services/activation-gate.js";
import { ensureCompanyMember } from "../../domain/services/company-access.js";
import { GetMyCompanyActivationQuery } from "./get-my-company-activation.query.js";

/**
 * Sert au client le **même** verdict d'activation que celui que voit le staff.
 *
 * Pourquoi un lecteur « admin » sur une route client : le verdict n'est écrit
 * qu'une fois (`activationGate`, cf. le JSDoc d'`ActivationGate`), et il se
 * calcule sur la fiche que lit la porte d'activation elle-même
 * (`ActivateCompanyByStaffHandler` lit `AdminCompanyReader.byId`, vérifié le
 * 2026-09-15). Assembler une autre vue pour le client, c'était rouvrir la
 * possibilité que l'écran client et la porte serveur se contredisent.
 *
 * Le lecteur est cross-tenant : le mur n'est donc pas dans sa requête, il est
 * **avant** — l'appartenance est vérifiée d'abord, et un non-membre est refusé
 * (404 non divulguant) sans que la société soit lue. Seul le verdict sort ;
 * la fiche staff (traces d'activation, certifications) ne quitte pas le handler.
 */
@QueryHandler(GetMyCompanyActivationQuery)
export class GetMyCompanyActivationHandler implements IQueryHandler<
  GetMyCompanyActivationQuery,
  ActivationGate
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: AdminCompanyReader,
  ) {}

  async execute(query: GetMyCompanyActivationQuery): Promise<ActivationGate> {
    const role = await this.memberships.roleOf(query.actorUserId, query.companyId);
    ensureCompanyMember(role, query.companyId);

    const company = await this.companies.byId(query.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(query.companyId);
    }
    return activationGate(company);
  }
}
