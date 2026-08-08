import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { CompanyDeclaredEvent } from "../../domain/events/company-declared.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { EstablishmentDirectory } from "../../domain/ports/establishment-directory.js";

/**
 * Abonné : `company.declared` → **résout le code NAF** de la société depuis son
 * SIRET (API entreprises) et l'enregistre sur l'agrégat. Découplé de la
 * transaction de déclaration (l'appel externe ne doit pas la ralentir/faire
 * échouer). **Best-effort** : SIRET introuvable ou API indisponible ⇒ on ne
 * touche à rien (le `nafCode` reste vide, rattrapé par le backfill).
 */
@EventsHandler(CompanyDeclaredEvent)
export class OnCompanyDeclaredResolveNaf implements IEventHandler<CompanyDeclaredEvent> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly directory: EstablishmentDirectory,
  ) {}

  async handle(event: CompanyDeclaredEvent): Promise<void> {
    const company = await this.companies.load(event.companyId);
    if (company === null) {
      return;
    }
    const naf = await this.directory.resolveNaf(company.siret.value);
    if (naf === null) {
      return;
    }
    company.assignNaf(naf);
    await this.companies.save(company);
  }
}
