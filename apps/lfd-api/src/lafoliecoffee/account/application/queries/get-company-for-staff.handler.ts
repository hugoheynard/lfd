import type { CompanyAddressesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  AdminCompanyReader,
  type AdminCompanyFicheView,
} from "../../domain/ports/admin-company.reader.js";
import { activationGate } from "../../domain/services/activation-gate.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { GetCompanyForStaffQuery } from "./get-company-for-staff.query.js";

/**
 * Sert la fiche d'une société au staff. Pas de mur `company_id` — l'auth staff
 * (`AdminAuthGuard`) garde la surface en amont. `null` (aucune société pour cet
 * id) devient un `CompanyNotFoundError` (404) : le staff voit toutes les
 * sociétés, donc rien à cacher — c'est un simple « n'existe pas ».
 *
 * La fiche part avec son **verdict d'activation** (`gate`) : ce qui bloque, et
 * si le serveur accepterait d'activer. C'est la seule autorité — l'écran
 * l'affiche, il ne le recalcule pas.
 *
 * Sans `delivery_procedures:read`, chaque adresse du carnet part avec
 * `procedureStepCount: 0` (DG-D8) — voir {@link withoutProcedureCounts}.
 */
@QueryHandler(GetCompanyForStaffQuery)
export class GetCompanyForStaffHandler implements IQueryHandler<
  GetCompanyForStaffQuery,
  AdminCompanyFicheView
> {
  constructor(private readonly companies: AdminCompanyReader) {}

  async execute(query: GetCompanyForStaffQuery): Promise<AdminCompanyFicheView> {
    const company = await this.companies.byId(query.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(query.companyId);
    }
    // Le **verdict** part avec la fiche, calculé par la fonction qui garde aussi
    // la porte d'activation. L'écran n'a plus rien à redéduire — et ne peut donc
    // plus se contredire avec le serveur.
    const addresses = query.withProcedureCounts
      ? company.addresses
      : withoutProcedureCounts(company.addresses);
    return { ...company, addresses, gate: activationGate(company) };
  }
}

/**
 * Le carnet sans le nombre d'étapes de procédure (DG-D8).
 *
 * `0` plutôt qu'un champ retiré : `procedureStepCount` est un `number` du
 * contrat, lu par le front en ligne et par `@lfd/b2b-ui`, qui n'affiche la
 * ligne « Procédure de livraison » qu'au-dessus de zéro. Zéro rend donc
 * exactement l'écran d'un lecteur qui n'a pas à savoir — sans casser le contrat.
 */
function withoutProcedureCounts(addresses: CompanyAddressesView): CompanyAddressesView {
  return {
    ...addresses,
    deliveries: addresses.deliveries.map((address) => ({ ...address, procedureStepCount: 0 })),
  };
}
